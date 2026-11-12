// ================= FIREBASE YAPILANDIRMASI (rutiva-db) =================
const firebaseConfig = {
    apiKey: "AIzaSyCgaQFGfLI8Wv2cVKuXBwux-NNWdMhINP4",
    authDomain: "rutiva-db.firebaseapp.com",
    projectId: "rutiva-db",
    storageBucket: "rutiva-db.firebasestorage.app",
    messagingSenderId: "1061356505510",
    appId: "1:1061356505510:web:7491d44d01068e6014a767",
    measurementId: "G-76937HVFX0"
};

const GOOGLE_WEB_CLIENT_ID = "1061356505510-bu8fks3id3vnitjebte8469ma1p2ha7l.apps.googleusercontent.com";

let currentUser = null;
let db = null;
let auth = null;
let analytics = null;
let googleAuthInitialized = false;

// Android Native (Capacitor) Kontrolü
function isNativeAndroid() {
    return Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

// GoogleAuth Eklentisini Güvenli Başlatma
async function ensureGoogleAuthInitialized() {
    if (!isNativeAndroid()) return null;
    const GoogleAuth = window.Capacitor.Plugins?.GoogleAuth;
    if (!GoogleAuth) return null;

    if (!googleAuthInitialized) {
        await GoogleAuth.initialize({
            clientId: GOOGLE_WEB_CLIENT_ID,
            scopes: ['profile', 'email'],
            grantOfflineAccess: true
        });
        googleAuthInitialized = true;
    }
    return GoogleAuth;
}

// Standart Android Bildirim Çubuğu ve Native Özellikler
async function initNativeAndroidFeatures() {
    if (!isNativeAndroid()) return;

    // Ekstra üst boşluğu sıfırla (Android standart durum çubuğu yüksekliğini kendi ayarlar)
    document.body.classList.remove('is-native-android');
    document.body.style.paddingTop = '0px';
    document.body.style.marginTop = '0px';
    const topHeader = document.querySelector('header');
    if (topHeader) {
        topHeader.style.paddingTop = '12px';
    }

    try {
        const StatusBar = window.Capacitor.Plugins?.StatusBar;
        if (StatusBar) {
            await StatusBar.setOverlaysWebView({ overlay: false });
            await StatusBar.setBackgroundColor({ color: '#4f46e5' });
        }
    } catch (err) {
        console.warn("StatusBar ayarlanamadı:", err);
    }

    try {
        await ensureGoogleAuthInitialized();
    } catch (err) {
        console.warn("GoogleAuth ön başlatma hatası:", err);
    }
}

// Firebase Başlatma
try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    if (typeof firebase.analytics === 'function') {
        analytics = firebase.analytics();
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('userInfo')?.classList.remove('hidden');
            document.getElementById('homeLoginBtn')?.classList.add('hidden');
            document.getElementById('mobileBottomNav')?.classList.remove('hidden');

            document.getElementById('profileName').innerText = user.displayName || 'Kullanıcı';
            document.getElementById('profileStatus').innerText = 'Google Bulut Senkronizasyonu Aktif';
            document.getElementById('userPhoto').src = user.photoURL || 'https://via.placeholder.com/80';
            document.getElementById('profileAvatar').src = user.photoURL || 'https://via.placeholder.com/80';

            loadFromCloud();
            navigateTo('page-home');
        } else {
            currentUser = null;
            document.getElementById('userInfo')?.classList.add('hidden');
            document.getElementById('homeLoginBtn')?.classList.remove('hidden');
            document.getElementById('profileName').innerText = 'Hoş Geldiniz';
            document.getElementById('profileStatus').innerText = 'Yerel Mod (Cihaz Hafızası)';
            document.getElementById('profileAvatar').src = 'https://via.placeholder.com/80?text=Kullan%C4%B1c%C4%B1';

            navigateTo('page-login');
        }
    });
} catch (e) {
    console.error("Firebase Başlatma Hatası:", e);
}

// --- GLOBAL DEĞİŞKENLER ---
let medications = JSON.parse(localStorage.getItem('medications')) || [];
let appointments = JSON.parse(localStorage.getItem('appointments')) || [];
let notes = JSON.parse(localStorage.getItem('notes')) || [];
let currentActiveAlarmMedId = null;
let currentCalendarDate = new Date();

function getTodayString(dateObj = new Date()) {
    const offset = dateObj.getTimezoneOffset();
    const date = new Date(dateObj.getTime() - (offset * 60 * 1000));
    return date.toISOString().split('T')[0];
}

// --- ARAYÜZ YÜKLENDİĞİNDE ---
window.addEventListener('DOMContentLoaded', () => {
    document.title = "Rutiva";
    initNativeAndroidFeatures();
    requestNotificationPermission();
    renderMeds();
    renderAppointments();
    renderNotes();
    renderHomeTodayMeds();
    renderCalendar();
    setupEventListeners();

    setInterval(checkAlarmsAndNotifications, 10000);
});

// SAYFA YÖNLENDİRME (SPA ROUTER)
window.navigateTo = function(pageId) {
    const pages = document.querySelectorAll('.page-view');
    pages.forEach(page => page.classList.add('hidden'));

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    const navButtons = document.querySelectorAll('.mobile-nav-btn');
    navButtons.forEach(btn => {
        btn.classList.remove('active', 'text-indigo-600');
        btn.classList.add('text-slate-400');
        if (btn.getAttribute('onclick')?.includes(pageId)) {
            btn.classList.add('active', 'text-indigo-600');
            btn.classList.remove('text-slate-400');
        }
    });

    if (pageId === 'page-calendar') renderCalendar();
    if (pageId === 'page-home') renderHomeTodayMeds();
};

window.continueAsGuest = function() {
    document.getElementById('mobileBottomNav')?.classList.remove('hidden');
    navigateTo('page-home');
};

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function setupEventListeners() {
    document.getElementById('medForm')?.addEventListener('submit', addMedication);
    document.getElementById('appForm')?.addEventListener('submit', addAppointment);
    document.getElementById('noteForm')?.addEventListener('submit', addNote);

    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    document.getElementById('snoozeBtn')?.addEventListener('click', snoozeAlarm);
    document.getElementById('takePillBtn')?.addEventListener('click', confirmTakePill);
    document.getElementById('closeDetailBtn')?.addEventListener('click', closeDetailModal);
    document.getElementById('closeDetailIconBtn')?.addEventListener('click', closeDetailModal);
}

// ================= GOOGLE İLE GİRİŞ (ANDROID NATIVE + WEB) =================
window.loginWithGoogle = async function() {
    if (!auth) {
        alert("Firebase bağlantısı kurulamadı.");
        return;
    }

    // 1. Android APK içinde yerel Google hesap seçicisini aç
    if (isNativeAndroid()) {
        try {
            const GoogleAuth = await ensureGoogleAuthInitialized();
            if (!GoogleAuth) {
                alert("Android Google Giriş eklentisi bulunamadı.");
                return;
            }
            const googleUser = await GoogleAuth.signIn();
            const idToken = googleUser?.authentication?.idToken || googleUser?.idToken;
            if (!idToken) {
                alert("Google kimlik belirteci (idToken) alınamadı.");
                return;
            }
            const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
            await auth.signInWithCredential(credential);
        } catch (error) {
            console.error("Android Google Giriş Hatası:", error);
            const msg = String(error?.message || error || "");
            if (msg.includes("12501") || msg.toLowerCase().includes("cancel")) {
                return;
            }
            const errCode = error?.code ? ` (Kod: ${error.code})` : "";
            alert("Giriş yapılamadı: " + msg + errCode);
        }
        return;
    }

    // 2. Web tarayıcısında çalışıyorsa Popup (engellenirse Redirect) kullan
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await auth.signInWithPopup(provider);
    } catch (error) {
        if (error.code === 'auth/popup-blocked') {
            await auth.signInWithRedirect(provider);
        } else if (error.code !== 'auth/popup-closed-by-user') {
            console.error("Web Giriş Hatası:", error);
            alert("Giriş Hatası: " + error.message);
        }
    }
};

async function logout() {
    try {
        if (isNativeAndroid() && window.Capacitor.Plugins?.GoogleAuth) {
            await window.Capacitor.Plugins.GoogleAuth.signOut();
        }
    } catch (e) {}

    if (auth) {
        auth.signOut().then(() => {
            navigateTo('page-login');
        });
    }
}

// ================= NOT DEFTERİ MODÜLÜ =================
function addNote(e) {
    e.preventDefault();
    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;

    const newNote = {
        id: 'note_' + Date.now(),
        title: title,
        content: content,
        date: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    };

    notes.unshift(newNote);
    saveNotes();
    renderNotes();
    document.getElementById('noteForm').reset();
}

window.deleteNote = function(id) {
    notes = notes.filter(n => n.id !== id);
    saveNotes();
    renderNotes();
};

function renderNotes() {
    const container = document.getElementById('notesList');
    if (!container) return;
    container.innerHTML = '';

    if (notes.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-xs italic col-span-2">Henüz eklenmiş not bulunmuyor.</p>`;
        return;
    }

    notes.forEach(n => {
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-2 relative flex flex-col justify-between";
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start gap-2">
                    <h4 class="font-bold text-slate-800 text-sm">${n.title}</h4>
                    <button onclick="deleteNote('${n.id}')" class="text-slate-400 hover:text-rose-600 text-xs">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <p class="text-xs text-slate-600 mt-1 whitespace-pre-line">${n.content}</p>
            </div>
            <div class="pt-2 border-t text-[10px] text-slate-400 text-right">
                ${n.date}
            </div>
        `;
        container.appendChild(card);
    });
}

function saveNotes() {
    localStorage.setItem('notes', JSON.stringify(notes));
    syncToCloud();
}

// ================= İLAÇ YÖNETİMİ =================
function addMedication(e) {
    e.preventDefault();
    const total = parseInt(document.getElementById('medTotal').value);
    const med = {
        id: 'med_' + Date.now(),
        name: document.getElementById('medName').value,
        totalStock: total,
        currentStock: total,
        dailyDose: parseInt(document.getElementById('medDailyDose').value),
        time: document.getElementById('medTime').value,
        usage: document.getElementById('medUsage').value,
        sideEffects: document.getElementById('medSideEffects').value || 'Belirtilmedi.',
        logs: [],
        lastNotifiedThreshold: 100
    };

    medications.push(med);
    saveMeds();
    renderMeds();
    document.getElementById('medForm').reset();
    navigateTo('page-med-list');
}

window.deleteMedication = function(id) {
    medications = medications.filter(m => m.id !== id);
    saveMeds();
    renderMeds();
};

window.manualTakePill = function(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;

    const todayStr = getTodayString();
    const todayLogs = med.logs ? med.logs.filter(l => l.date === todayStr) : [];

    if (todayLogs.length >= med.dailyDose) {
        alert(`Bugün bu ilaç için verilmesi gereken ${med.dailyDose} doz hakkınızı zaten tamamladınız!`);
        return;
    }

    if (med.currentStock > 0) {
        med.currentStock--;
        if (!med.logs) med.logs = [];
        med.logs.push({ date: todayStr, status: 'taken' });
        saveMeds();
        renderMeds();
        renderHomeTodayMeds();
        renderCalendar();
    }
};

window.skipPill = function(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;

    const todayStr = getTodayString();
    const todayLogs = med.logs ? med.logs.filter(l => l.date === todayStr) : [];

    if (todayLogs.length >= med.dailyDose) {
        alert(`Bugün bu ilaç için gereken ${med.dailyDose} doz işlemini zaten yaptınız!`);
        return;
    }

    if (!med.logs) med.logs = [];
    med.logs.push({ date: todayStr, status: 'skipped' });
    saveMeds();
    renderMeds();
    renderHomeTodayMeds();
    renderCalendar();
};

function renderMeds() {
    const container = document.getElementById('medsList');
    if (!container) return;
    container.innerHTML = '';

    if (medications.length === 0) {
        container.innerHTML = `
            <div class="col-span-2 bg-white p-6 rounded-2xl text-center space-y-3 border border-slate-200">
                <p class="text-slate-400 text-xs">Henüz kayıtlı ilaç bulunmuyor.</p>
                <button onclick="navigateTo('page-med-add')" class="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-xl text-xs">
                    + Hemen İlaç Ekle
                </button>
            </div>
        `;
        return;
    }

    const todayStr = getTodayString();

    medications.forEach(med => {
        const percent = Math.round((med.currentStock / med.totalStock) * 100);
        const daysLeft = Math.floor(med.currentStock / med.dailyDose);

        const todayLogs = med.logs ? med.logs.filter(l => l.date === todayStr) : [];
        const isDoseCompleted = todayLogs.length >= med.dailyDose;

        let badgeColor = "bg-emerald-100 text-emerald-800";
        if (percent <= 25 || daysLeft <= 10) badgeColor = "bg-rose-100 text-rose-800 font-bold";
        else if (percent <= 50) badgeColor = "bg-amber-100 text-amber-800";

        const card = document.createElement('div');
        card.className = "bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3 relative flex flex-col justify-between";
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-slate-800 text-base">${med.name}</h4>
                        <span class="text-xs text-slate-500"><i class="fa-regular fa-clock"></i> Saat: <b>${med.time}</b></span>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[11px] ${badgeColor}">
                        %${percent} Stok (${med.currentStock} Tablet)
                    </span>
                </div>

                <div class="w-full bg-slate-100 rounded-full h-2 mt-3">
                    <div class="bg-indigo-600 h-2 rounded-full transition-all" style="width: ${percent}%"></div>
                </div>

                <div class="flex justify-between items-center text-xs text-slate-500 mt-2">
                    <span><i class="fa-solid fa-hourglass-half text-indigo-500"></i> Kalan: <b>${daysLeft} gün</b></span>
                    <span class="font-semibold ${isDoseCompleted ? 'text-emerald-600' : 'text-amber-600'}">
                        Bugün: ${todayLogs.length}/${med.dailyDose} Doz
                    </span>
                </div>
            </div>

            <div class="pt-3 border-t flex flex-col gap-2">
                ${isDoseCompleted ? `
                    <div class="bg-slate-100 text-slate-600 text-center py-2 rounded-xl text-xs font-semibold">
                        ✓ Bugünkü Doz İşlemi Tamamlandı
                    </div>
                ` : `
                    <div class="flex gap-2">
                        <button onclick="manualTakePill('${med.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1 shadow-sm">
                            <i class="fa-solid fa-check"></i> İçtim
                        </button>
                        <button onclick="skipPill('${med.id}')" class="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1">
                            <i class="fa-solid fa-forward"></i> Atla
                        </button>
                    </div>
                `}

                <div class="flex justify-between items-center text-[11px] pt-1">
                    <button onclick="openDetailModal('${med.id}')" class="text-indigo-600 hover:underline font-semibold flex items-center gap-1">
                        <i class="fa-solid fa-circle-info"></i> Yan Etkiler
                    </button>
                    <button onclick="deleteMedication('${med.id}')" class="text-slate-400 hover:text-rose-600">
                        <i class="fa-solid fa-trash"></i> Sil
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderHomeTodayMeds() {
    const container = document.getElementById('homeTodayMeds');
    if (!container) return;
    container.innerHTML = '';

    if (medications.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-xs italic">Henüz kaydedilmiş ilaç yok.</p>`;
        return;
    }

    const todayStr = getTodayString();

    medications.forEach(med => {
        const todayLogs = med.logs ? med.logs.filter(l => l.date === todayStr) : [];
        const isDone = todayLogs.length >= med.dailyDose;

        const item = document.createElement('div');
        item.className = "flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs";
        item.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="fa-solid ${isDone ? 'fa-circle-check text-emerald-500' : 'fa-circle-dot text-indigo-500'} text-base"></i>
                <span class="font-bold text-slate-800">${med.name}</span>
                <span class="text-slate-400">(${med.time})</span>
            </div>
            <span class="px-2 py-0.5 rounded-md ${isDone ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-slate-200 text-slate-600'} text-[10px]">
                ${isDone ? 'Tamamlandı' : 'Bekliyor'}
            </span>
        `;
        container.appendChild(item);
    });
}

// ================= TAKVİM MODÜLÜ =================
window.changeMonth = function(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
};

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarMonthYear');
    if (!grid || !title) return;

    grid.innerHTML = '';

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    title.innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let startOffset = (firstDay === 0 ? 6 : firstDay - 1);

    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "calendar-day bg-transparent";
        grid.appendChild(emptyCell);
    }

    const todayStr = getTodayString();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = getTodayString(dateObj);

        let hasTaken = false;
        let hasSkipped = false;

        medications.forEach(med => {
            if (med.logs) {
                med.logs.forEach(l => {
                    if (l.date === dateStr) {
                        if (l.status === 'taken') hasTaken = true;
                        if (l.status === 'skipped') hasSkipped = true;
                    }
                });
            }
        });

        const dayCell = document.createElement('div');
        let statusClass = "bg-slate-50 border border-slate-200 text-slate-700";

        if (hasTaken) statusClass = "calendar-day-taken";
        else if (hasSkipped) statusClass = "calendar-day-skipped";

        if (dateStr === todayStr) statusClass += " ring-2 ring-indigo-500 font-bold";

        dayCell.className = `calendar-day ${statusClass}`;
        dayCell.innerHTML = `
            <span>${day}</span>
            ${hasTaken ? '<i class="fa-solid fa-check text-[9px] mt-0.5"></i>' : ''}
            ${hasSkipped && !hasTaken ? '<i class="fa-solid fa-xmark text-[9px] mt-0.5"></i>' : ''}
        `;

        grid.appendChild(dayCell);
    }
}

// ================= MUAYENE YÖNETİMİ =================
function addAppointment(e) {
    e.preventDefault();
    const dateStr = document.getElementById('appDate').value;
    const periodMonths = parseInt(document.getElementById('appPeriod').value);
    const doctorName = document.getElementById('appName').value;

    const app = {
        id: 'app_' + Date.now(),
        doctor: doctorName,
        date: dateStr,
        repeatPeriod: periodMonths,
        notified10Days: false
    };

    appointments.push(app);

    if (periodMonths > 0) {
        const nextDate = new Date(dateStr);
        nextDate.setMonth(nextDate.getMonth() + periodMonths);

        const nextApp = {
            id: 'app_' + (Date.now() + 1),
            doctor: `${doctorName} (${periodMonths} Ay Periyodik)`,
            date: nextDate.toISOString().slice(0, 16),
            repeatPeriod: periodMonths,
            notified10Days: false
        };
        appointments.push(nextApp);
    }

    saveAppointments();
    renderAppointments();
    document.getElementById('appForm').reset();
    checkAlarmsAndNotifications();
}

window.deleteAppointment = function(id) {
    appointments = appointments.filter(a => a.id !== id);
    saveAppointments();
    renderAppointments();
};

function renderAppointments() {
    const container = document.getElementById('appsList');
    if (!container) return;
    container.innerHTML = '';

    if (appointments.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-xs italic">Henüz kaydedilmiş randevunuz yok.</p>`;
        return;
    }

    appointments.sort((a, b) => new Date(a.date) - new Date(b.date));

    appointments.forEach(app => {
        const appDate = new Date(app.date);
        const today = new Date();
        const diffTime = appDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let badge = `<span class="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-[10px] font-semibold">${diffDays > 0 ? diffDays + ' Gün Kaldı' : 'Geçti'}</span>`;
        if (diffDays <= 10 && diffDays > 0) {
            badge = `<span class="bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-bold">⚠️ 10 Günden Az (${diffDays} Gün)</span>`;
        }

        const card = document.createElement('div');
        card.className = "bg-white p-3.5 rounded-xl border border-slate-200 flex justify-between items-center text-xs";
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-slate-800">${app.doctor}</h4>
                <div class="text-[11px] text-slate-500 mt-0.5">
                    ${appDate.toLocaleDateString('tr-TR')} - ${appDate.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                </div>
            </div>
            <div class="flex items-center gap-2">
                ${badge}
                <button onclick="deleteAppointment('${app.id}')" class="text-slate-400 hover:text-rose-600 p-1">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ================= ALARM KONTROLÜ =================
function checkAlarmsAndNotifications() {
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    medications.forEach(med => {
        if (med.time === currentTimeStr && !med.alreadyNotifiedToday) {
            triggerAlarm(med);
            med.alreadyNotifiedToday = true;
        }
    });

    if (currentTimeStr === "00:00") {
        medications.forEach(m => m.alreadyNotifiedToday = false);
    }

    appointments.forEach(app => {
        const appDate = new Date(app.date);
        const diffTime = appDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 10 && diffDays > 0 && !app.notified10Days) {
            sendNotification("🏥 Randevu Yaklaştı!", `${app.doctor} randevunuza ${diffDays} gün kaldı.`);
            app.notified10Days = true;
            saveAppointments();
        }
    });

    saveMeds();
}

function triggerAlarm(med) {
    currentActiveAlarmMedId = med.id;
    document.getElementById('alarmMedName').innerText = med.name;
    document.getElementById('alarmMedUsage').innerText = med.usage ? `Not: ${med.usage}` : '';
    document.getElementById('alarmModal').classList.remove('hidden');

    sendNotification("💊 İlaç Saati Geldi!", `${med.name} ilacınızı alma zamanı.`);
}

function snoozeAlarm() {
    document.getElementById('alarmModal').classList.add('hidden');
    sendNotification("⏰ Ertelendi", "İlaç hatırlatmanız 15 dakika sonrasına ertelendi.");

    setTimeout(() => {
        const med = medications.find(m => m.id === currentActiveAlarmMedId);
        if (med) triggerAlarm(med);
    }, 15 * 60 * 1000);
}

function confirmTakePill() {
    if (currentActiveAlarmMedId) {
        manualTakePill(currentActiveAlarmMedId);
        document.getElementById('alarmModal').classList.add('hidden');
    }
}

function sendNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body, icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png' });
    }
}

// ================= MODALLAR =================
window.openDetailModal = function(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;
    document.getElementById('detailTitle').innerText = med.name + " Detayları";
    document.getElementById('detailUsage').innerText = med.usage || "Özel talimat girilmedi.";
    document.getElementById('detailEffects').innerText = med.sideEffects || "Yan etki bilgisi girilmedi.";
    document.getElementById('detailModal').classList.remove('hidden');
};

function closeDetailModal() {
    document.getElementById('detailModal').classList.add('hidden');
}

// ================= KAYIT & BULUT SENKRONİZASYONU =================
function saveMeds() {
    localStorage.setItem('medications', JSON.stringify(medications));
    syncToCloud();
}

function saveAppointments() {
    localStorage.setItem('appointments', JSON.stringify(appointments));
    syncToCloud();
}

function syncToCloud() {
    if (currentUser && db) {
        db.collection("users").doc(currentUser.uid).set({
            medications: medications,
            appointments: appointments,
            notes: notes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
}

function loadFromCloud() {
    if (currentUser && db) {
        db.collection("users").doc(currentUser.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data.medications) {
                    medications = data.medications;
                    localStorage.setItem('medications', JSON.stringify(medications));
                    renderMeds();
                }
                if (data.appointments) {
                    appointments = data.appointments;
                    localStorage.setItem('appointments', JSON.stringify(appointments));
                    renderAppointments();
                }
                if (data.notes) {
                    notes = data.notes;
                    localStorage.setItem('notes', JSON.stringify(notes));
                    renderNotes();
                }
                renderHomeTodayMeds();
                renderCalendar();
            }
        });
    }
}
