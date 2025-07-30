document.addEventListener("DOMContentLoaded", () => {
    // --- AUTH CHECK & CONFIG ---
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'login.html';
        return;
    }
    const NODE_RED_URL = 'https://wastelog-nodered-services.up.railway.app';
    const WEBSOCKET_URL = 'wss://wastelog-nodered-services.up.railway.app/ws/websocket';
    const DEVICE_ID = 'gps_wastelog_01';

    // --- ELEMENTS ---
    const dashboardContainer = document.getElementById('dashboard-container');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const calendarEl = document.getElementById('calendar');
    const logoutButton = document.getElementById('logoutButton');
    const manualMeasureBtn = document.getElementById('manualMeasureBtn');
    const mapElement = document.getElementById('map');
    const addGeofenceBtn = document.getElementById('addGeofenceBtn');
    const geofenceFormContainer = document.getElementById('geofenceFormContainer');
    const geofenceForm = document.getElementById('geofenceForm');
    const cancelGeofenceBtn = document.getElementById('cancelGeofence');
    const geofenceTableBody = document.querySelector('#geofenceTable tbody');
    const eventPopover = document.getElementById('event-popover');
    
    const manualMeasureResultCard = document.getElementById('manualMeasureResultCard');
    const manualVolumeEl = document.getElementById('manualVolume');
    const manualDistanceEl = document.getElementById('manualDistance');
    const manualTimestampEl = document.getElementById('manualTimestamp');
      
    // --- STATE ---
    let geofenceData = [];

    // --- MAP SETUP ---
    const map = L.map(mapElement).setView([-7.414038, 109.373714], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const vehicleIcon = L.icon({ iconUrl: 'assets/images/truck.png', iconSize: [45, 45], iconAnchor: [22, 44], popupAnchor: [0, -45] });
    let vehicleMarker = L.marker([0, 0], { icon: vehicleIcon }).addTo(map).bindPopup("Lokasi Truk Sampah");
    let geofenceLayers = L.layerGroup().addTo(map);

    // --- Simpan teks tombol asli di luar event listener ---
    const originalManualButtonHTML = manualMeasureBtn.innerHTML;

    // --- FUNGSI-FUNGSI ---
    
    const connectWebSocket = () => {
        const ws = new WebSocket(WEBSOCKET_URL);
        ws.onopen = () => console.log('WebSocket terhubung!');
        ws.onmessage = (event) => {
            console.log("Menerima data dari WebSocket:", event.data);
            try {
                const data = JSON.parse(event.data);
                const payload = data.payload || data;

                if (payload.deviceId !== DEVICE_ID) return;

                if (payload.location && payload.location.lat && payload.location.lon) {
                    const newLatLng = [payload.location.lat, payload.location.lon];
                    if(vehicleMarker) {
                        vehicleMarker.setLatLng(newLatLng);
                        map.panTo(newLatLng);
                    }
                }
                
                if (payload.source === 'manual' && payload.event === 'VOLUME_MEASUREMENT') {
                    console.log('Menerima update pengukuran manual via WebSocket:', payload);
                    manualVolumeEl.textContent = `${payload.calculatedVolume_m3.toFixed(4)} m³`;
                    manualDistanceEl.textContent = `${payload.distance_cm} cm`;
                    manualTimestampEl.textContent = new Date(payload.timestamp).toLocaleString('id-ID');
                    manualMeasureResultCard.style.display = 'block';
                }

            } catch (e) {
                console.error("Gagal mem-parsing data WebSocket:", e);
            }
        };
        ws.onerror = (err) => console.error('WebSocket error:', err);
        ws.onclose = () => {
            console.log('WebSocket terputus. Mencoba menghubungkan kembali dalam 5 detik...');
            setTimeout(connectWebSocket, 5000);
        };
    };

    const renderGeofences = (geofences) => {
        geofenceLayers.clearLayers();
        geofenceTableBody.innerHTML = '';
        geofences.forEach(fence => {
            const innerRadius = Math.min(fence.radius1, fence.radius2);
            const outerRadius = Math.max(fence.radius1, fence.radius2);
            L.circle([fence.latitude, fence.longitude], { radius: innerRadius, color: '#2E7D32', weight: 2, fillOpacity: 0.1 }).addTo(geofenceLayers).bindTooltip(fence.nama);
            L.circle([fence.latitude, fence.longitude], { radius: outerRadius, color: '#D32F2F', weight: 2, fillOpacity: 0.1, dashArray: '5, 10' }).addTo(geofenceLayers);
            
            const row = document.createElement('tr');
            row.setAttribute('data-id', fence.id);
            row.innerHTML = `<td>${fence.nama}</td><td><button class="btn btn-secondary btn-sm edit-btn" data-id="${fence.id}">Edit</button> <button class="btn btn-danger btn-sm delete-btn" data-id="${fence.id}">Hapus</button></td>`;
            geofenceTableBody.appendChild(row);
        });
    };
    
    const fetchAndDisplayGeofences = async () => { 
        try { 
            const response = await fetch(`${NODE_RED_URL}/api/geofences`);
            if (!response.ok) throw new Error("Gagal mengambil data dari server");
            geofenceData = await response.json();
            renderGeofences(geofenceData);
        } catch (error) { 
            console.error('Gagal mengambil data geofence:', error);
            alert('Gagal memuat data area geofence.');
        } 
    };
    
    const showGeofenceForm = (fence = null) => {
        geofenceForm.reset();
        document.getElementById('geofenceId').value = '';
        if (fence) {
            document.getElementById('geofenceId').value = fence.id;
            document.getElementById('geofenceName').value = fence.nama;
            document.getElementById('geofenceLat').value = fence.latitude;
            document.getElementById('geofenceLon').value = fence.longitude;
            document.getElementById('geofenceRadius1').value = Math.min(fence.radius1, fence.radius2);
            document.getElementById('geofenceRadius2').value = Math.max(fence.radius1, fence.radius2);
        }
        geofenceFormContainer.classList.remove('hidden');
    };
    
    sidebarToggle.addEventListener('click', () => {
        dashboardContainer.classList.toggle('sidebar-closed');
        setTimeout(() => map.invalidateSize(), 300); 
    });

    logoutButton.addEventListener('click', () => { 
        localStorage.clear();
        window.location.href = 'index.html'; 
    });

    manualMeasureBtn.addEventListener('click', () => {
        if (!confirm('Anda yakin ingin memicu pengukuran volume manual?')) return;
        
        manualMeasureBtn.disabled = true;
        manualMeasureBtn.innerHTML = `<i class="fas fa-spinner fa-spin fa-fw"></i> <span class="nav-text">Mengirim...</span>`;
        manualMeasureResultCard.style.display = 'none';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        fetch(`${NODE_RED_URL}/api/measure`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: true, deviceId: DEVICE_ID }),
            signal: controller.signal
        })
        .then(response => {
            if (!response.ok && response.status !== 202) {
                throw new Error(`Server menolak perintah. Status: ${response.status}`);
            }
            manualMeasureBtn.innerHTML = `<i class="fas fa-check"></i> <span class="nav-text">Terkirim</span>`;
        })
        .catch(error => { 
            if (error.name === 'AbortError') {
                console.log("Permintaan timeout, tetapi perintah dianggap terkirim.");
                manualMeasureBtn.innerHTML = `<i class="fas fa-check"></i> <span class="nav-text">Terkirim</span>`;
            } else {
                console.error('Gagal memicu pengukuran manual:', error); 
                alert(`Gagal memicu pengukuran manual. \n\nError: ${error.message}`);
                manualMeasureBtn.innerHTML = originalManualButtonHTML;
            }
        })
        .finally(() => {
            clearTimeout(timeoutId);
            setTimeout(() => {
                manualMeasureBtn.disabled = false;
                manualMeasureBtn.innerHTML = originalManualButtonHTML;
            }, 4000);
        });
    });

    addGeofenceBtn.addEventListener('click', () => showGeofenceForm());
    cancelGeofenceBtn.addEventListener('click', () => geofenceFormContainer.classList.add('hidden'));
    
    map.on('click', (e) => { 
        if (!geofenceFormContainer.classList.contains('hidden')) { 
            document.getElementById('geofenceLat').value = e.latlng.lat.toFixed(6); 
            document.getElementById('geofenceLon').value = e.latlng.lng.toFixed(6); 
        } 
    });
      
    geofenceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('geofenceId').value;
        const body = { 
            nama: document.getElementById('geofenceName').value, 
            latitude: parseFloat(document.getElementById('geofenceLat').value), 
            longitude: parseFloat(document.getElementById('geofenceLon').value), 
            radius1: parseInt(document.getElementById('geofenceRadius1').value, 10), 
            radius2: parseInt(document.getElementById('geofenceRadius2').value, 10)
        };
        try {
            const response = await fetch(id ? `${NODE_RED_URL}/api/geofences/${id}` : `${NODE_RED_URL}/api/geofences`, { 
                method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
            });
            if (response.ok) {
                geofenceFormContainer.classList.add('hidden');
                fetchAndDisplayGeofences();
            } else {
                alert('Gagal menyimpan geofence. Status: ' + response.status);
            }
        } catch (error) { 
            console.error('Error menyimpan geofence:', error); 
            alert('Terjadi kesalahan saat menyimpan data.');
        }
    });

    geofenceTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        if (!id) return;

        if (target.classList.contains('edit-btn')) {
            const fenceToEdit = geofenceData.find(f => f.id === id);
            if (fenceToEdit) showGeofenceForm(fenceToEdit);
        } else if (target.classList.contains('delete-btn')) {
            if (confirm('Anda yakin ingin menghapus area ini?')) {
                try {
                    await fetch(`${NODE_RED_URL}/api/geofences/${id}`, { method: 'DELETE' });
                    fetchAndDisplayGeofences();
                } catch (error) {
                    console.error('Gagal menghapus geofence:', error);
                    alert('Gagal menghapus area.');
                }
            }
        }
    });
    
    const formatTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g,':') : '-';
    const formatDuration = (seconds) => (seconds === null || seconds === undefined) ? '-' : `${Math.round(seconds / 60)} menit`;
    
    const formatVolumeDetails = (visit) => {
        if (!visit || !visit.measurement) return '<li class="list-group-item">Data volume tidak lengkap.</li>';
        
        const initial = visit.measurement.initialVolume_m3;
        const final = visit.measurement.finalVolume_m3;
        const collected = visit.collectedVolume_m3;
        
        if (collected == null || initial == null || final == null) {
            return '<li class="list-group-item">Data volume tidak tersedia.</li>';
        }

        return `
            <li class="list-group-item d-flex justify-content-between align-items-center"><span>Volume Awal</span> <span class="badge bg-secondary rounded-pill">${initial.toFixed(4)} m³</span></li>
            <li class="list-group-item d-flex justify-content-between align-items-center"><span>Volume Akhir</span> <span class="badge bg-secondary rounded-pill">${final.toFixed(4)} m³</span></li>
            <li class="list-group-item d-flex justify-content-between align-items-center list-group-item-success"><strong>Volume Terkumpul</strong> <strong>${collected.toFixed(4)} m³</strong></li>
        `;
    };
    
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'id',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listWeek' },
        buttonText: { dayGridMonth: 'Bulan', dayGridWeek: 'Minggu', listWeek: 'Daftar' },
        eventClick: (info) => {
            info.jsEvent.preventDefault();
            
            const visit = info.event.extendedProps;
            const popoverContent = `
                <div class="popover-header d-flex justify-content-between align-items-center">
                    <strong>${info.event.title}</strong>
                    <button type="button" class="btn-close" onclick="document.getElementById('event-popover').style.display='none'"></button>
                </div>
                <div class="popover-body">
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item d-flex justify-content-between"><span>Waktu Masuk:</span> <strong>${formatTime(visit.entryTime)}</strong></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Waktu Keluar:</span> <strong>${formatTime(visit.exitTime)}</strong></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Durasi:</span> <strong>${formatDuration(visit.durationSeconds)}</strong></li>
                        ${formatVolumeDetails(visit)}
                    </ul>
                </div>
            `;
            
            eventPopover.innerHTML = popoverContent;
            const rect = info.el.getBoundingClientRect();
            eventPopover.style.left = `${rect.left + window.scrollX}px`;
            eventPopover.style.top = `${rect.bottom + window.scrollY}px`;
            eventPopover.style.display = 'block';
        },
        eventContent: (arg) => {
            const volume = arg.event.extendedProps.collectedVolume_m3;
            if (volume !== null && volume !== undefined) {
                let eventHtml = `<div class="fc-event-main-frame">
                    <div class="fc-event-title-container">
                        <div class="fc-event-title fc-sticky">${arg.event.title}</div>
                    </div>`;
                if(arg.view.type === 'dayGridMonth' || arg.view.type === 'dayGridWeek'){
                     eventHtml += `<div class="fc-event-volume">${volume.toFixed(3)} m³</div>`;
                }
                eventHtml += `</div>`;
                return { html: eventHtml };
            }
        }
    });
    calendar.render();

    document.addEventListener('click', function(e) {
        if (eventPopover && eventPopover.style.display === 'block') {
            if (!eventPopover.contains(e.target) && !e.target.closest('.fc-event')) {
                 eventPopover.style.display = 'none';
            }
        }
    });

    const fetchHistoryAndRender = async () => {
        try {
            const response = await fetch(`${NODE_RED_URL}/api/history?deviceId=${DEVICE_ID}`);
            if (!response.ok) throw new Error("Gagal mengambil data histori");

            const historyLogs = await response.json();
            if (historyLogs.error) throw new Error(historyLogs.error);
            
            const calendarEvents = historyLogs
                .filter(log => log.deviceId === DEVICE_ID && log.logType === 'VISIT_SESSION' && log.status === 'COMPLETED')
                .map(visit => ({
                    title: visit.areaName || 'Kunjungan Area',
                    start: visit.entryTime,
                    end: visit.exitTime,
                    extendedProps: visit
                }));
                
            calendar.getEventSources().forEach(source => source.remove());
            calendar.addEventSource(calendarEvents);

        } catch (error) {
            console.error('Terjadi error saat memproses data histori:', error);
            alert(`Gagal memuat data riwayat kunjungan.\n\nError: ${error.message}`);
        }
    };
     
    const initializeDashboard = () => {
        connectWebSocket(); // Langsung hubungkan WebSocket
        fetchAndDisplayGeofences().then(() => {
            fetchHistoryAndRender(); 
        });
        setInterval(fetchHistoryAndRender, 60000); 
    };

    initializeDashboard();
});
