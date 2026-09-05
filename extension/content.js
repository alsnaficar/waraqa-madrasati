
// --- سكريبت حقن وتشغيل ورقة مدرستي التلقائي ---

(function () {
    console.log("🚀 تم تشغيل إضافة ورقة مدرستي بنجاح");

    // بيانات الحصص الأسبوعية المطابقة لجدولك
    const ScheduleData = {
        weekNum: 1,
        totalLessons: 19,
        preparedCount: 5,
        remainingCount: 14,
        days: [
            {
                name: "الأحد",
                slots: [
                    { c: "لغتي الخالدة", g: "أول متوسط (1) - بنين", l: "الأفعال الخمسة وإعرابها", r: true },
                    { c: "لغتي الخالدة", g: "أول متوسط (2) - بنين", l: "الأفعال الخمسة وإعرابها", r: true },
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (1) - بنين", l: "الفاعل ونائبه", r: false },
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (2) - بنين", l: "الفاعل ونائبه", r: false },
                    null
                ]
            },
            {
                name: "الإثنين",
                slots: [
                    { c: "لغتي الخالدة", g: "أول متوسط (1) - بنين", l: "رسم الهمزة المتوسطة", r: true },
                    null,
                    { c: "لغتي الخالدة", g: "أول متوسط (2) - بنين", l: "رسم الهمزة المتوسطة", r: true },
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (1) - بنين", l: "المفعول به وعلامات إعرابه", r: false },
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (2) - بنين", l: "المفعول به وعلامات إعرابه", r: false }
                ]
            },
            {
                name: "الثلاثاء",
                slots: [
                    { c: "لغتي الخالدة", g: "أول متوسط (1) - بنين", l: "النص الشعري (من أجل عينيك)", r: false },
                    { c: "لغتي الخالدة", g: "أول متوسط (2) - بنين", l: "النص الشعري (من أجل عينيك)", r: false },
                    null,
                    null,
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (1) - بنين", l: "الأسلوب اللغوي: النداء", r: true },
                    null
                ]
            },
            {
                name: "الأربعاء",
                slots: [
                    { c: "لغتي الخالدة", g: "ثاني متوسط (2) - بنين", l: "الصنف اللغوي: المعرب والمبني", r: false },
                    { c: "لغتي الخالدة", g: "أول متوسط (1) - بنين", l: "التواصل اللغوي: إدارة ندوة", r: false },
                    null,
                    { c: "لغتي الخالدة", g: "أول متوسط (2) - بنين", l: "التواصل اللغوي: إدارة ندوة", r: false },
                    null,
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (1) - بنين", l: "الصنف اللغوي: المعرب والمبني", r: false }
                ]
            },
            {
                name: "الخميس",
                slots: [
                    { c: "لغتي الخالدة", g: "أول متوسط (1) - بنين", l: "مراجعة وتقويم الوحدة", r: false },
                    { c: "لغتي الخالدة", g: "أول متوسط (2) - بنين", l: "مراجعة وتقويم الوحدة", r: false },
                    null,
                    { c: "لغتي الخالدة", g: "ثاني متوسط (1) - بنين", l: "مراجعة وتقويم الوحدة", r: false },
                    { c: "لغتي الخالدة", g: "ثاني متوسط (2) - بنين", l: "مراجعة وتقويم الوحدة", r: false },
                    null,
                    null
                ]
            }
        ]
    };


    // ============================================================
    // WARAQAH PREPARATION STATE V1
    // حفظ واسترجاع حالة التحضير
    // ============================================================

    const WARAQAH_PREPARATION_STATE_V1 = "waraqah_preparation_state_v1";

    function getWaraqahStorageKey() {
        return `${WARAQAH_PREPARATION_STATE_V1}_week_${ScheduleData.weekNum}`;
    }

    function savePreparationState() {
        try {
            const state = ScheduleData.days.map(day =>
                day.slots.map(slot => slot ? Boolean(slot.r) : null)
            );

            localStorage.setItem(
                getWaraqahStorageKey(),
                JSON.stringify(state)
            );

            console.log("💾 ورقة: تم حفظ حالة التحضير");
        } catch (error) {
            console.warn("⚠️ ورقة: تعذر حفظ حالة التحضير", error);
        }
    }

    function loadPreparationState() {
        try {
            const raw = localStorage.getItem(getWaraqahStorageKey());

            if (!raw) {
                console.log("ℹ️ ورقة: لا توجد حالة محفوظة");
                return;
            }

            const state = JSON.parse(raw);

            if (!Array.isArray(state)) {
                console.warn("⚠️ ورقة: الحالة المحفوظة غير صالحة");
                return;
            }

            ScheduleData.days.forEach((day, dIdx) => {
                const savedDay = state[dIdx];

                if (!Array.isArray(savedDay)) return;

                day.slots.forEach((slot, sIdx) => {
                    if (!slot) return;

                    if (typeof savedDay[sIdx] === "boolean") {
                        slot.r = savedDay[sIdx];
                    }
                });
            });

            console.log("🔄 ورقة: تم استرجاع حالة التحضير");
        } catch (error) {
            console.warn("⚠️ ورقة: تعذر استرجاع حالة التحضير", error);
        }
    }

    function getPreparationStats() {
        let total = 0;
        let prepared = 0;

        ScheduleData.days.forEach(day => {
            day.slots.forEach(slot => {
                if (!slot) return;

                total++;

                if (slot.r) {
                    prepared++;
                }
            });
        });

        return {
            total: total,
            prepared: prepared,
            remaining: total - prepared
        };
    }

    function updatePreparationStats() {
        const stats = getPreparationStats();

        ScheduleData.totalLessons = stats.total;
        ScheduleData.preparedCount = stats.prepared;
        ScheduleData.remainingCount = stats.remaining;

        const prep = document.getElementById("wq-prep-count");
        const rem = document.getElementById("wq-rem-count");

        if (prep) {
            prep.innerText = String(stats.prepared);
        }

        if (rem) {
            rem.innerText = String(stats.remaining);
        }
    }


    function getWaraqahUserInfo() {
        try {
            const selectors = [
                "[data-user-name]",
                "[data-username]",
                ".user-profile .name",
                ".user-profile .user-name",
                ".header-user .name",
                ".header-user .user-name",
                "#divUserAccount .name",
                "#divUserAccount .user-name",
                ".top-header-account .name"
            ];

            let name = "";

            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (!el) continue;

                name = String(
                    el.getAttribute("data-user-name") ||
                    el.getAttribute("data-username") ||
                    el.innerText ||
                    el.textContent ||
                    ""
                ).replace(/\s+/g, " ").trim();

                if (name) break;
            }

            if (!name) {
                const account = document.querySelector(
                    ".user-profile, .header-user, #divUserAccount, .top-header-account"
                );

                if (account) {
                    name = String(
                        account.innerText ||
                        account.textContent ||
                        ""
                    ).replace(/\s+/g, " ").trim();
                }
            }

            name = name
                .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
                .replace(/\s+/g, " ")
                .trim();

            if (name.length > 50) {
                name = "";
            }

            const text = String(document.body?.innerText || "");

            return {
                name,
                title: /أستاذة|الأستاذة|معلمة|المعلمة/.test(text)
                    ? "أستاذة"
                    : "أستاذ"
            };
        } catch (_) {
            return {
                name: "",
                title: "أستاذ"
            };
        }
    }

    function injectWaraqahDashboard() {
        // حاجز المصادقة النهائي.
        if (!isWaraqahLoggedIn()) {
            return;
        }

        if (document.getElementById('waraqah-extension-root')) return;
        if (document.getElementById('waraqah-launcher')) return;
        const launcher = document.createElement('button');
        launcher.id = 'waraqah-launcher';
        launcher.type = 'button';
        launcher.title = 'ورقة مدرستي';
        launcher.setAttribute('aria-label', 'فتح ورقة مدرستي');
        const wqUser = getWaraqahUserInfo();
        const wqGreeting = wqUser.name
            ? `مرحبًا بك ${wqUser.title} ${wqUser.name} 👋`
            : `مرحبًا بك ${wqUser.title} 👋`;

        launcher.innerHTML = `
            <span class="wq-intro-message">${wqGreeting}</span>
            <span class="wq-brand-mark">
                <img src="${chrome.runtime.getURL("assets/waraqah-logo.svg")}" alt="ورقة">
            </span>
        `;


        const root = document.createElement('div');
        root.id = 'waraqah-extension-root';
        root.style.display = 'none';

        root.innerHTML = `
            <!-- شريط الأسبوع والتوزيع المعتمد -->
            <div class="wq-header-bar">
                <button class="wq-btn-nav" id="wq-prev-week">◀ الأسبوع السابق</button>
                <div class="wq-week-title">
                    📅 الأسبوع الأول (الحالي): من الأحد 10 ربيع الأول 1448هـ إلى الخميس 14 ربيع الأول 1448هـ ⚡ توزيع معتمد
                </div>
                <button class="wq-btn-nav" id="wq-next-week">الأسبوع التالي ▶</button>
            </div>

            <!-- شريط التحكم والتحضير السريع -->
            <div class="wq-stats-controls">
                <div class="wq-badges-group">
                    <span class="wq-badge">📚 الحصص: ${ScheduleData.totalLessons}</span>
                    <span class="wq-badge green">✅ المحضرة: <span id="wq-prep-count">${ScheduleData.preparedCount}</span></span>
                    <span class="wq-badge orange">⏳ المتبقي: <span id="wq-rem-count">${ScheduleData.remainingCount}</span></span>
                    <select class="wq-select"><option>النوع: بنين 👦</option></select>
                    <select class="wq-select"><option>نمط الأسبوع: حضوري للكل 🏫</option></select>
                </div>
                <div class="wq-actions-group">
                    <button class="wq-btn-nav" style="background:#0284c7;">📣 نشر الخطة ▾</button>
                    <button class="wq-btn-prep-all" id="wq-btn-prep-all">⚡ تحضير أسبوعي كامل</button>
                    <button class="wq-btn-del-all" id="wq-btn-del-all">🗑️ حذف التحضير الأسبوعي</button>
                </div>
            </div>

            <!-- جدول الحصص الشامل -->
            <div class="wq-table-wrap">
                <table class="wq-table">
                    <thead>
                        <tr>
                            <th>اليوم / الحصة</th>
                            <th>الحصة 1</th>
                            <th>الحصة 2</th>
                            <th>الحصة 3</th>
                            <th>الحصة 4</th>
                            <th>الحصة 5</th>
                            <th>الحصة 6</th>
                            <th>الحصة 7</th>
                            <th>إجراءات اليوم ⚡</th>
                        </tr>
                    </thead>
                    <tbody id="wq-table-body"></tbody>
                </table>
            </div>

            <!-- كروت الخدمات الملونة السفلية -->
            <div class="wq-services-row">
                <div class="wq-svc-card wq-svc-blue" onclick="alert('🗓️ الخطة الفصلية - توزيع المنهج للأسابيع')">
                    <span class="wq-svc-title">الخطة الفصلية 🗓️</span>
                    <span class="wq-svc-sub">توزيع المنهج للأسابيع</span>
                </div>
                <div class="wq-svc-card wq-svc-teal" onclick="alert('📝 تصحيح الواجبات - التصحيح الآلي والرصد')">
                    <span class="wq-svc-title">تصحيح الواجبات 📝</span>
                    <span class="wq-svc-sub">التصحيح الآلي والرصد</span>
                </div>
                <div class="wq-svc-card wq-svc-purple" onclick="alert('📊 تقارير الواجبات - كشف الدرجات والصفوف')">
                    <span class="wq-svc-title">تقارير الواجبات 📊</span>
                    <span class="wq-svc-sub">كشف الدرجات والصفوف</span>
                </div>
                <div class="wq-svc-card wq-svc-cyan" onclick="alert('📈 تقارير الاختبارات - كشف درجات الاختبارات')">
                    <span class="wq-svc-title">تقارير الاختبارات 📈</span>
                    <span class="wq-svc-sub">كشف درجات الاختبارات</span>
                </div>
                <div class="wq-svc-card wq-svc-orange" onclick="alert('📄 أوراق العمل - توليد أوراق الأنشطة')">
                    <span class="wq-svc-title">أوراق العمل 📄</span>
                    <span class="wq-svc-sub">توليد أوراق الأنشطة</span>
                </div>
                <div class="wq-svc-card wq-svc-red" onclick="alert('🎯 نماذج الاختبارات - بنك الأسئلة والتقييم')">
                    <span class="wq-svc-title">نماذج الاختبارات 🎯</span>
                    <span class="wq-svc-sub">بنك الأسئلة والتقييم</span>
                </div>
            </div>
        `;

        // إدراج الواجهة في أعلى الصفحة
        const targetContainer = document.body;
        const firstChild = document.body.firstElementChild;

        if (firstChild) {
            document.body.insertBefore(root, firstChild);
        } else {
            document.body.appendChild(root);
        }

        document.body.appendChild(launcher);

        // ========================================================
        // WARAQAH PREMIUM INTRO
        // ترحيب يظهر من أعلى الشاشة ثم يتحول إلى شعار ورقة.
        // ========================================================
        requestAnimationFrame(() => {
            launcher.classList.add("wq-intro-active");

            window.setTimeout(() => {
                const currentLauncher =
                    document.getElementById("waraqah-launcher");

                if (!currentLauncher) return;

                currentLauncher.classList.add("wq-ready");
            }, 2200);
        });

        launcher.addEventListener('click', function () {
            const closed = root.style.display === 'none';

            if (closed) {
                root.style.display = 'block';
                launcher.classList.add('is-open');
                launcher.classList.add('wq-launcher-hidden');
                launcher.setAttribute('aria-label', 'إغلاق ورقة مدرستي');
                launcher.title = 'إغلاق ورقة مدرستي';
            } else {
                root.style.display = 'none';
                launcher.classList.remove('is-open');
                launcher.classList.remove('wq-launcher-hidden');
                launcher.setAttribute('aria-label', 'فتح ورقة مدرستي');
                launcher.title = 'ورقة مدرستي';
            }
        });

        renderSchedule();
        updatePreparationStats();
        bindEvents();
    }

    function renderSchedule() {
        const tbody = document.getElementById("wq-table-body");

        if (!tbody) return;

        tbody.innerHTML = "";

        ScheduleData.days.forEach((day, dIdx) => {
            const tr = document.createElement("tr");

            let rowHtml = `
                <td class="wq-cell-day">${day.name}</td>
            `;

            day.slots.forEach((slot, sIdx) => {

                if (!slot) {
                    rowHtml += `
                        <td style="color:#475569;font-weight:bold;">-</td>
                    `;
                    return;
                }

                const readyClass = slot.r ? "✅" : "⚪";

                rowHtml += `
                    <td>
                        <div class="wq-slot-card">

                            <span class="wq-slot-tag">
                                🏫 حضوري
                            </span>

                            <div class="wq-slot-title">
                                ${slot.c}
                            </div>

                            <div class="wq-slot-grade">
                                ${slot.g}
                            </div>

                            <div class="wq-slot-lesson">
                                ${readyClass} ${slot.l}
                            </div>

                            <div>
                                <button
                                    class="wq-btn-card-print"
                                    data-d="${dIdx}"
                                    data-s="${sIdx}">
                                    🖨️ طباعة التحضير
                                </button>

                                <button
                                    class="wq-btn-card-del"
                                    data-d="${dIdx}"
                                    data-s="${sIdx}">
                                    🗑️ حذف
                                </button>
                            </div>

                        </div>
                    </td>
                `;
            });

            const daySlots = day.slots.filter(Boolean);
            const dayPrepared = daySlots.filter(slot => slot.r).length;
            const dayRemaining = daySlots.length - dayPrepared;

            const dayStatus =
                dayRemaining === 0
                    ? "✅ مكتمل"
                    : `⏳ متبقي ${dayRemaining}`;

            rowHtml += `
                <td>
                    <div class="wq-day-actions">

                        <span
                            class="wq-badge ${
                                dayRemaining === 0
                                    ? "green"
                                    : "orange"
                            } wq-day-status"
                            style="font-size:10px;">
                            ${dayStatus}
                        </span>

                        <button
                            class="wq-btn-day-prep"
                            data-day="${dIdx}">
                            ⚡ تحضير يومي
                        </button>

                        <button
                            class="wq-btn-day-del"
                            data-day="${dIdx}">
                            🗑️ حذف اليوم
                        </button>

                    </div>
                </td>
            `;

            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });


        // --------------------------------------------------------
        // طباعة التحضير
        // --------------------------------------------------------

        document.querySelectorAll(".wq-btn-card-print").forEach(btn => {

            btn.onclick = function () {

                const d = Number(this.dataset.d);
                const s = Number(this.dataset.s);

                const slot = ScheduleData.days[d]?.slots[s];

                if (!slot) return;

                alert(`🖨️ طباعة تحضير: ${slot.l}`);
            };

        });


        // --------------------------------------------------------
        // حذف حصة واحدة
        // --------------------------------------------------------

        document.querySelectorAll(".wq-btn-card-del").forEach(btn => {

            btn.onclick = function () {

                const d = Number(this.dataset.d);
                const s = Number(this.dataset.s);

                const slot = ScheduleData.days[d]?.slots[s];

                if (!slot) return;

                slot.r = false;

                savePreparationState();
                updatePreparationStats();
                renderSchedule();
            };

        });


        // --------------------------------------------------------
        // تحضير يوم كامل
        // --------------------------------------------------------

        document.querySelectorAll(".wq-btn-day-prep").forEach(btn => {

            btn.onclick = function () {

                const d = Number(this.dataset.day);
                const day = ScheduleData.days[d];

                if (!day) return;

                day.slots.forEach(slot => {
                    if (slot) {
                        slot.r = true;
                    }
                });

                savePreparationState();
                updatePreparationStats();
                renderSchedule();

                alert(
                    `⚡ تم تحضير حصص يوم (${day.name}) آلياً!`
                );
            };

        });


        // --------------------------------------------------------
        // حذف تحضير اليوم
        // --------------------------------------------------------

        document.querySelectorAll(".wq-btn-day-del").forEach(btn => {

            btn.onclick = function () {

                const d = Number(this.dataset.day);
                const day = ScheduleData.days[d];

                if (!day) return;

                day.slots.forEach(slot => {
                    if (slot) {
                        slot.r = false;
                    }
                });

                savePreparationState();
                updatePreparationStats();
                renderSchedule();
            };

        });

    }

    function bindEvents() {

        const prepAll = document.getElementById("wq-btn-prep-all");

        if (prepAll) {

            prepAll.onclick = function () {

                ScheduleData.days.forEach(day => {
                    day.slots.forEach(slot => {
                        if (slot) {
                            slot.r = true;
                        }
                    });
                });

                savePreparationState();
                updatePreparationStats();
                renderSchedule();

                alert(
                    "⚡ تم تحضير الأسبوع الدراسي بالكامل في ورقة!"
                );
            };
        }


        const delAll = document.getElementById("wq-btn-del-all");

        if (delAll) {

            delAll.onclick = function () {

                ScheduleData.days.forEach(day => {
                    day.slots.forEach(slot => {
                        if (slot) {
                            slot.r = false;
                        }
                    });
                });

                savePreparationState();
                updatePreparationStats();
                renderSchedule();

                alert(
                    "🗑️ تم حذف وتفريغ تحضير الأسبوع!"
                );
            };
        }

    }

    // ============================================================
    // WARAQAH AUTH GATE
    // لا تظهر واجهة ورقة إلا بعد تسجيل الدخول في منصة مدرستي
    // ============================================================

    let waraqahAuthenticated = false;
    let waraqahAuthTimer = null;
    let waraqahAuthObserver = null;

    function isWaraqahLoginPage() {
        try {
            const path = (window.location.pathname || "").toLowerCase();

            // --------------------------------------------------------
            // صفحات تسجيل الدخول الحقيقية فقط.
            // لا نعتبر "/" صفحة دخول لأن مدرستي تستخدم الصفحة
            // الرئيسية نفسها بعد تسجيل الدخول.
            // --------------------------------------------------------
            if (
                path === "/login" ||
                path.startsWith("/login/")
            ) {
                return true;
            }

            // وجود نموذج كلمة مرور مرئي = صفحة دخول فعلية.
            const passwordInput = document.querySelector(
                'input[type="password"], input[name*="password" i], input[id*="password" i]'
            );

            if (passwordInput) {
                const style = window.getComputedStyle(passwordInput);

                const visible =
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    passwordInput.offsetWidth > 0 &&
                    passwordInput.offsetHeight > 0;

                if (visible) {
                    return true;
                }
            }

            // لا نعتمد على نص "تسجيل الدخول" وحده،
            // لأنه قد يظهر داخل عناصر أخرى بعد تسجيل الدخول.
            return false;

        } catch (error) {
            console.warn("⚠️ ورقة: تعذر تحديد صفحة الدخول", error);
            return false;
        }
    }

    function hasWaraqahAuthenticatedMarker() {
        try {
            // ========================================================
            // 1) علامات الحساب/تسجيل الخروج المباشرة
            // ========================================================
            const selectors = [
                "#signout-button",
                "a[href*='Logout']",
                "a[href*='logout']",
                "button[id*='logout' i]",
                "button[id*='signout' i]",
                "button[class*='logout' i]",
                "button[class*='signout' i]",
                ".user-profile",
                ".header-user",
                "#divUserAccount",
                ".top-header-account"
            ];

            for (const selector of selectors) {
                try {
                    if (document.querySelector(selector)) {
                        return true;
                    }
                } catch (_) {}
            }

            // ========================================================
            // 2) مؤشرات لوحة المستخدم الحالية
            // ========================================================
            const bodyText = String(document.body?.innerText || "")
                .replace(/\s+/g, " ")
                .trim();

            const dashboardMarkers = [
                "الجدول الدراسي",
                "الواجبات",
                "الاختبارات",
                "سجلات متابعة الفصول",
                "مرحبا بك",
                "مرحبًا بك"
            ];

            const markerHits = dashboardMarkers.filter(marker =>
                bodyText.includes(marker)
            ).length;

            // وجود مؤشرين من لوحة المستخدم يكفي.
            if (markerHits >= 2) {
                return true;
            }

            // ========================================================
            // 3) اسم المستخدم / البريد مع عنصر واضح من الحساب
            // ========================================================
            const accountSelectors = [
                "[data-user-name]",
                "[data-username]",
                ".user-profile",
                ".header-user",
                "#divUserAccount",
                ".top-header-account"
            ];

            for (const selector of accountSelectors) {
                try {
                    if (document.querySelector(selector)) {
                        return true;
                    }
                } catch (_) {}
            }

            // ========================================================
            // 4) البريد الإلكتروني + مؤشر واحد من لوحة المستخدم
            // ========================================================
            const hasEmail =
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bodyText);

            if (hasEmail && markerHits >= 1) {
                return true;
            }

            return false;

        } catch (error) {
            console.warn("⚠️ ورقة: تعذر فحص علامة تسجيل الدخول", error);
            return false;
        }
    }

    function isWaraqahLoggedIn() {
        try {
            const path = String(window.location.pathname || "").toLowerCase();

            // صفحات الدخول فقط
            if (
                path === "/login" ||
                path.startsWith("/login/")
            ) {
                return false;
            }

            // نموذج كلمة مرور مرئي = لم يسجل الدخول
            const passwordInputs = document.querySelectorAll(
                'input[type="password"], input[name*="password" i], input[id*="password" i]'
            );

            for (const input of passwordInputs) {
                try {
                    const style = window.getComputedStyle(input);
                    if (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        input.offsetWidth > 0 &&
                        input.offsetHeight > 0
                    ) {
                        return false;
                    }
                } catch (_) {}
            }

            // --------------------------------------------------------
            // مدرستي بعد تسجيل الدخول
            // --------------------------------------------------------
            const text = String(document.body?.innerText || "")
                .replace(/\s+/g, " ")
                .trim();

            const markers = [
                "الجدول الدراسي",
                "الواجبات",
                "الاختبارات",
                "سجلات متابعة الفصول"
            ];

            const hits = markers.filter(x => text.includes(x)).length;

            if (hits >= 2) {
                console.log(
                    "🔐 ورقة: تم التعرف على لوحة مدرستي - مسجل دخول",
                    { hits }
                );
                return true;
            }

            // علامات تسجيل الخروج
            const logoutSelectors = [
                "#signout-button",
                "a[href*='Logout']",
                "a[href*='logout']",
                "button[id*='logout' i]",
                "button[id*='signout' i]",
                "button[class*='logout' i]",
                "button[class*='signout' i]"
            ];

            for (const selector of logoutSelectors) {
                try {
                    if (document.querySelector(selector)) {
                        console.log(
                            "🔐 ورقة: تم اكتشاف علامة تسجيل الخروج"
                        );
                        return true;
                    }
                } catch (_) {}
            }

            // عناصر الحساب
            const accountSelectors = [
                "[data-user-name]",
                "[data-username]",
                ".user-profile",
                ".header-user",
                "#divUserAccount",
                ".top-header-account"
            ];

            for (const selector of accountSelectors) {
                try {
                    if (document.querySelector(selector)) {
                        console.log(
                            "🔐 ورقة: تم اكتشاف عنصر حساب المستخدم",
                            selector
                        );
                        return true;
                    }
                } catch (_) {}
            }

            return false;

        } catch (error) {
            console.warn(
                "⚠️ ورقة: خطأ في تحديد حالة تسجيل الدخول",
                error
            );
            return false;
        }
    }

    function removeWaraqahDashboard() {
        const root = document.getElementById("waraqah-extension-root");
        const launcher = document.getElementById("waraqah-launcher");

        if (root) {
            root.remove();
        }

        if (launcher) {
            launcher.classList.remove('wq-launcher-hidden');
            launcher.remove();
        }

        console.log("🧹 ورقة: تمت إزالة الواجهة والشعار لأن المستخدم غير مسجل دخول");
    }

    function syncWaraqahAuthState() {
        const loggedIn = isWaraqahLoggedIn();

        // عند عدم تسجيل الدخول يجب إزالة أي واجهة موجودة،
        // حتى لو كانت قد حُقنت بواسطة نسخة سابقة من الإضافة.
        if (!loggedIn) {
            if (waraqahAuthenticated) {
                console.log("🔒 ورقة: انتهت جلسة الدخول - إخفاء الواجهة");
            } else if (document.getElementById("waraqah-extension-root")) {
                console.log("🧹 ورقة: إزالة واجهة قديمة قبل تسجيل الدخول");
            }

            waraqahAuthenticated = false;
            removeWaraqahDashboard();
            return;
        }

        // مسجل دخول بالفعل والواجهة موجودة.
        if (waraqahAuthenticated) {
            return;
        }

        waraqahAuthenticated = true;

        console.log("🔐 ورقة: تم اكتشاف تسجيل الدخول - تشغيل ورقة");

        loadPreparationState();

        if (!document.getElementById("waraqah-extension-root")) {
            injectWaraqahDashboard();
        }
    }

    function startWaraqahAuthenticationGuard() {
        syncWaraqahAuthState();

        if (waraqahAuthTimer) {
            clearInterval(waraqahAuthTimer);
        }

        // مدرستي تستخدم تحميلًا ديناميكيًا؛ نراقب تغير حالة الصفحة
        waraqahAuthTimer = setInterval(() => {
            syncWaraqahAuthState();
        }, 1000);

        if (waraqahAuthObserver) {
            waraqahAuthObserver.disconnect();
        }

        waraqahAuthObserver = new MutationObserver(() => {
            syncWaraqahAuthState();
        });

        if (document.documentElement) {
            waraqahAuthObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            startWaraqahAuthenticationGuard,
            { once: true }
        );
    } else {
        startWaraqahAuthenticationGuard();
    }

    // ------------------------------------------------------------
    // WARAGH PAIRING (claim) — content script side
    // The content script makes NO network request and holds NO storage.
    // Every claim is delegated to the service worker (background.js) via
    // chrome.runtime.sendMessage. The worker owns the fetch to
    // POST /api/madrasati/pairing/claim and never returns the token here.
    // ------------------------------------------------------------
    window.__waraghPairingClaim = function (token) {
        return new Promise(function (resolve) {
            try {
                chrome.runtime.sendMessage(
                    { type: "WARAGH_PAIRING_CLAIM", token: String(token) },
                    function (response) {
                        if (chrome.runtime.lastError) {
                            resolve({ ok: false, code: "error" });
                            return;
                        }
                        resolve(response || { ok: false, code: "error" });
                    }
                );
            } catch (error) {
                resolve({ ok: false, code: "error" });
            }
        });
    };
    window.__waraghHasPairingBridge = true;

})();
