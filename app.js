import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  onSnapshot,
  serverTimestamp,
  getDocs,
  writeBatch,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  ADMIN_EMAIL,
  BANK_ACCOUNT,
  SUBSCRIPTION_DAYS,
  packageCatalog,
  seedAuthors,
  defaultFirebaseConfig,
} from "./data.js";

const appRoot = document.querySelector("#app");
const THEME_KEY = "mitosi-theme";

const state = {
  bootError: "",
  authReady: false,
  user: null,
  userProfile: null,
  authors: [],
  selectedAuthorId: null,
  selectedWorkId: null,
  selectedTab: "summary",
  currentScreen: "landing",
  authMode: "login",
  selectedPlan: packageCatalog[0].id,
  payments: [],
  users: [],
  loading: {
    authors: true,
    payments: true,
  },
};

const firebaseConfig = window.MITOSI_FIREBASE_CONFIG || defaultFirebaseConfig;
const hasValidFirebaseConfig = !Object.values(firebaseConfig).some((value) => String(value).startsWith("PASTE_"));

let firebaseApp;
let auth;
let db;
let storage;

if (hasValidFirebaseConfig) {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  storage = getStorage(firebaseApp);
} else {
  state.bootError = "Firebase კონფიგურაცია არ არის შევსებული. `data.js`-ში ან `window.MITOSI_FIREBASE_CONFIG`-ით ჩასვი პროექტის პარამეტრები.";
}

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("ka-GE", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const setTheme = (theme) => {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
};

const initTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  setTheme(saved || "light");
};

const roleOf = (email) => (email === ADMIN_EMAIL ? "admin" : "student");

const ensureUserProfile = async (firebaseUser) => {
  const userRef = doc(db, "users", firebaseUser.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      fullName: firebaseUser.displayName || "",
      role: roleOf(firebaseUser.email),
      status: roleOf(firebaseUser.email) === "admin" ? "active" : "inactive",
      selectedPlan: null,
      subscriptionStartedAt: null,
      subscriptionExpiresAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (snapshot.data().role !== roleOf(firebaseUser.email)) {
    await updateDoc(userRef, {
      role: roleOf(firebaseUser.email),
      updatedAt: serverTimestamp(),
    });
  }
};

const ensureSeedData = async () => {
  const authorsRef = collection(db, "authors");
  const authorsSnap = await getDocs(authorsRef);
  if (!authorsSnap.empty) return;

  const batch = writeBatch(db);
  seedAuthors.forEach((author) => {
    const authorRef = doc(db, "authors", author.id);
    batch.set(authorRef, {
      id: author.id,
      name: author.name,
      era: author.era,
      bio: author.bio,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    author.works.forEach((work) => {
      const workRef = doc(db, "authors", author.id, "works", work.id);
      batch.set(workRef, {
        ...work,
        authorId: author.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  });

  await batch.commit();
};

const syncExpiryIfNeeded = async (profile) => {
  if (!profile?.subscriptionExpiresAt || profile.status !== "active") return profile;
  const expiry =
    typeof profile.subscriptionExpiresAt?.toDate === "function"
      ? profile.subscriptionExpiresAt.toDate().getTime()
      : new Date(profile.subscriptionExpiresAt).getTime();

  if (Date.now() < expiry) return profile;

  await updateDoc(doc(db, "users", profile.uid), {
    status: "inactive",
    selectedPlan: null,
    updatedAt: serverTimestamp(),
  });

  return { ...profile, status: "inactive", selectedPlan: null };
};

const subscribeAppData = () => {
  onSnapshot(collection(db, "authors"), async (snapshot) => {
    const authorDocs = snapshot.docs.map((item) => item.data());
    const worksPromises = authorDocs.map(async (author) => {
      const workSnap = await getDocs(collection(db, "authors", author.id, "works"));
      return {
        ...author,
        works: workSnap.docs.map((work) => work.data()),
      };
    });

    state.authors = await Promise.all(worksPromises);
    if (!state.selectedAuthorId && state.authors[0]) {
      state.selectedAuthorId = state.authors[0].id;
      state.selectedWorkId = state.authors[0].works[0]?.id || null;
    }
    state.loading.authors = false;
    render();
  });

  const paymentQuery = query(collection(db, "payments"), orderBy("createdAt", "desc"));
  onSnapshot(paymentQuery, (snapshot) => {
    state.payments = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.loading.payments = false;
    render();
  });

  const userQuery = query(collection(db, "users"));
  onSnapshot(userQuery, async (snapshot) => {
    state.users = snapshot.docs.map((item) => item.data());
    if (state.user) {
      const profile = state.users.find((item) => item.uid === state.user.uid) || null;
      state.userProfile = profile ? await syncExpiryIfNeeded(profile) : null;
      state.currentScreen = state.userProfile?.role === "admin" ? "admin" : "dashboard";
    }
    render();
  });
};

const getSelectedAuthor = () => state.authors.find((author) => author.id === state.selectedAuthorId) || null;
const getSelectedWork = () => {
  const author = getSelectedAuthor();
  return author?.works?.find((work) => work.id === state.selectedWorkId) || author?.works?.[0] || null;
};

const countdownText = () => {
  const expiryRaw = state.userProfile?.subscriptionExpiresAt;
  if (!expiryRaw || state.userProfile?.status !== "active") return "გამოწერა არაა აქტიური";
  const expiry = typeof expiryRaw?.toDate === "function" ? expiryRaw.toDate().getTime() : new Date(expiryRaw).getTime();
  const diff = expiry - Date.now();
  if (diff <= 0) return "ვადა დასრულდა";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${days} დღე • ${hours} სთ • ${minutes} წთ`;
};

const paymentForUser = () => state.payments.find((item) => item.userId === state.user?.uid && item.status === "pending");

const canSeeQuizzes = () => state.userProfile?.selectedPlan === "plus" || state.userProfile?.role === "admin";

const handleAuth = async (event) => {
  event.preventDefault();
  if (!auth) return;

  const form = new FormData(event.currentTarget);
  const fullName = form.get("fullName")?.toString().trim() || "";
  const email = form.get("email")?.toString().trim() || "";
  const password = form.get("password")?.toString().trim() || "";

  try {
    if (state.authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        email,
        fullName,
        role: roleOf(email),
        status: roleOf(email) === "admin" ? "active" : "inactive",
        selectedPlan: null,
        subscriptionStartedAt: null,
        subscriptionExpiresAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    alert(error.message);
  }
};

const handlePaymentUpload = async (event) => {
  event.preventDefault();
  if (!state.user || !storage) return;

  const form = new FormData(event.currentTarget);
  const planId = form.get("plan");
  const file = form.get("receipt");
  const packageInfo = packageCatalog.find((item) => item.id === planId);

  if (!(file instanceof File) || file.size === 0) {
    alert("ატვირთე გადახდის სქრინშოტი.");
    return;
  }

  try {
    const storageRef = ref(storage, `receipts/${state.user.uid}/${Date.now()}-${file.name}`);
    await uploadBytes(storageRef, file);
    const receiptUrl = await getDownloadURL(storageRef);

    const pendingExisting = paymentForUser();
    if (pendingExisting) {
      alert("შენი გადახდა უკვე გადამოწმების პროცესშია.");
      return;
    }

    await addDoc(collection(db, "payments"), {
      userId: state.user.uid,
      userEmail: state.user.email,
      userName: state.userProfile?.fullName || "",
      planId,
      planName: packageInfo?.name || "",
      price: packageInfo?.price || null,
      receiptUrl,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "users", state.user.uid), {
      status: "pending",
      selectedPlan: planId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    alert(error.message);
  }
};

const approvePayment = async (payment) => {
  const now = Date.now();
  const expiresAt = new Date(now + SUBSCRIPTION_DAYS * 86400000);
  await updateDoc(doc(db, "users", payment.userId), {
    status: "active",
    selectedPlan: payment.planId,
    subscriptionStartedAt: new Date(now).toISOString(),
    subscriptionExpiresAt: expiresAt.toISOString(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "payments", payment.id), { status: "approved", reviewedAt: serverTimestamp() });
};

const rejectPayment = async (payment) => {
  await updateDoc(doc(db, "users", payment.userId), {
    status: "inactive",
    selectedPlan: null,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "payments", payment.id), { status: "rejected", reviewedAt: serverTimestamp() });
};

const handleAuthorCreate = async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id").toString().trim();
  await setDoc(doc(db, "authors", id), {
    id,
    name: form.get("name").toString().trim(),
    era: form.get("era").toString().trim(),
    bio: form.get("bio").toString().trim(),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  event.currentTarget.reset();
};

const handleWorkCreate = async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const authorId = form.get("authorId").toString().trim();
  const workId = form.get("workId").toString().trim();
  const quizzesRaw = form.get("quizzes").toString().trim();
  let quizzes = [];

  if (quizzesRaw) {
    try {
      quizzes = JSON.parse(quizzesRaw);
    } catch {
      alert("ქვიზების ველი უნდა იყოს სწორი JSON.");
      return;
    }
  }

  await setDoc(doc(db, "authors", authorId, "works", workId), {
    id: workId,
    authorId,
    title: form.get("title").toString().trim(),
    tabs: {
      summary: { label: "შინაარსი", content: form.get("summary").toString().trim() },
      biography: { label: "განხილვა", content: form.get("analysis").toString().trim() },
      characters: { label: "დახასიათება", content: form.get("characters").toString().trim() },
      plan: { label: "გეგმა", content: form.get("plan").toString().trim() },
      quotes: { label: "ციტატები", content: form.get("quotes").toString().trim() },
    },
    quizzes,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  event.currentTarget.reset();
};

const renderLanding = () => `
  <div class="hero">
    <section class="panel">
      <span class="pill">Premium Educational Platform</span>
      <h1 class="headline">მითოსი — მათთვის, ვინც ქართულს უმაღლეს ქულაზე ჩააბარებს.</h1>
      <p class="lead">
        ქართული ლიტერატურის პრემიუმ ბიბლიოთეკა აბიტურიენტებისთვის: სტრუქტურირებული კონტენტი,
        ესესთვის გამზადებული არგუმენტები, ციტატები, თემატური განხილვები და ქვიზები ერთ სივრცეში.
      </p>
      <div class="actions">
        <button class="btn gold" data-action="go-auth">დაწყება</button>
        <button class="btn secondary" data-action="theme-toggle">მუქი რეჟიმი</button>
      </div>
      <div class="stats">
        <article class="stat"><strong>${seedAuthors.length}+</strong><span class="muted">ავტორი seed-ბაზაში</span></article>
        <article class="stat"><strong>Realtime</strong><span class="muted">Firestore onSnapshot სინქრონიზაცია</span></article>
        <article class="stat"><strong>30 დღე</strong><span class="muted">აქტიური აბონენტის წვდომა</span></article>
      </div>
    </section>
    <aside class="panel">
      <span class="pill subtle">ბრენდი</span>
      <h2>Minimal Library Aesthetic</h2>
      <p class="lead">
        ლოგო აგებულია ელეგანტურ ტექსტზე, სადაც „ო“ გადაკეთებულია წიგნის/მელნის ნიშნად.
        ინტერფეისი თბილია, მსუბუქი და პრემიუმ, ხოლო Dark Mode ინარჩუნებს იმავე სიმშვიდეს.
      </p>
      <div class="card">
        <p class="meta">პაკეტი 1</p>
        <div class="price">5₾</div>
        <p class="meta">შინაარსი, ბიოგრაფია, დახასიათება, გეგმა, განხილვა</p>
      </div>
      <div class="card" style="margin-top:12px;">
        <p class="meta">პაკეტი 2</p>
        <div class="price">10₾</div>
        <p class="meta">ყველაფერი + ქვიზები და ტესტები</p>
      </div>
    </aside>
  </div>
`;

const renderAuth = () => `
  <div class="auth-wrap grid">
    <section class="auth-card">
      <span class="pill">${state.authMode === "login" ? "ავტორიზაცია" : "რეგისტრაცია"}</span>
      <h2>${state.authMode === "login" ? "შესვლა" : "ახალი ანგარიშის შექმნა"}</h2>
      <p class="lead">თუ ელფოსტა არის <strong>${ADMIN_EMAIL}</strong>, სისტემა ავტომატურად მიანიჭებს Admin როლს.</p>
      <form id="auth-form">
        ${state.authMode === "signup" ? `
          <label class="field">
            <span>სრული სახელი</span>
            <input name="fullName" placeholder="მაგ. გიორგი ჯავახიშვილი" required />
          </label>
        ` : ""}
        <label class="field">
          <span>ელფოსტა</span>
          <input name="email" type="email" required />
        </label>
        <label class="field">
          <span>პაროლი</span>
          <input name="password" type="password" minlength="6" required />
        </label>
        <div class="actions">
          <button class="btn gold" type="submit">${state.authMode === "login" ? "შესვლა" : "რეგისტრაცია"}</button>
          <button class="btn secondary" type="button" data-action="toggle-auth">
            ${state.authMode === "login" ? "ახალი ანგარიში" : "უკვე მაქვს ანგარიში"}
          </button>
        </div>
      </form>
    </section>
    <section class="auth-card">
      <span class="pill">Firebase Flow</span>
      <h2>როგორ მუშაობს</h2>
      <div class="list">
        <div class="list-item">1. Email/Password ავტორიზაცია Firebase Auth-ით.</div>
        <div class="list-item">2. პროფილი იქმნება `users` კოლექციაში და ენიჭება `student` ან `admin` როლი.</div>
        <div class="list-item">3. გადახდის სქრინშოტი იტვირთება Firebase Storage-ში, ხოლო მოთხოვნა ინახება Firestore-ში.</div>
        <div class="list-item">4. Admin ადასტურებს ან უარყოფს მოთხოვნას რეალურ დროში.</div>
      </div>
    </section>
  </div>
`;

const renderStudentDashboard = () => {
  const author = getSelectedAuthor();
  const work = getSelectedWork();
  const tabs = work?.tabs || {};
  const visibleTabs = Object.entries(tabs);
  const isActive = state.userProfile?.status === "active" || state.userProfile?.role === "admin";
  const pendingPayment = paymentForUser();

  return `
    <div class="dashboard">
      <aside class="panel sidebar">
        <span class="pill">${escapeHtml(state.userProfile?.role || "student")}</span>
        <h2>${escapeHtml(state.userProfile?.fullName || state.user?.email || "")}</h2>
        <p class="meta">${escapeHtml(state.user?.email || "")}</p>
        <p class="countdown">სტატუსი: ${escapeHtml(state.userProfile?.status || "inactive")}</p>
        <p class="countdown">დარჩენილი დრო: ${countdownText()}</p>
        <div class="menu">
          <button class="active">ბიბლიოთეკა</button>
          <button data-action="theme-toggle">რეჟიმის შეცვლა</button>
          <button data-action="logout">გასვლა</button>
        </div>
      </aside>
      <section class="content">
        ${
          !isActive
            ? `
          <div class="payment-grid">
            ${packageCatalog
              .map(
                (item) => `
              <article class="card" style="padding:24px;">
                <span class="pill">${escapeHtml(item.name)}</span>
                <div class="price">${item.price}₾</div>
                <p class="meta">${escapeHtml(item.description)}</p>
                <p class="meta">${item.features.map(escapeHtml).join(" • ")}</p>
                <button class="btn ${state.selectedPlan === item.id ? "gold" : "secondary"}" data-plan="${item.id}" data-action="select-plan">
                  ${state.selectedPlan === item.id ? "არჩეულია" : "ამ პაკეტის არჩევა"}
                </button>
              </article>
            `
              )
              .join("")}
          </div>
          <section class="panel">
            <span class="pill">გადახდის ინსტრუქცია</span>
            <h2>გადმორიცხე და ატვირთე სქრინშოტი</h2>
            <p class="lead">ანგარიშის ნომერი: <strong>${BANK_ACCOUNT}</strong></p>
            ${
              pendingPayment
                ? `<div class="empty">შენი გადახდა უკვე pending სტატუსშია და ადმინისტრატორი ამოწმებს.</div>`
                : `
              <form id="payment-form">
                <label class="field">
                  <span>არჩეული პაკეტი</span>
                  <select name="plan">
                    ${packageCatalog
                      .map(
                        (item) =>
                          `<option value="${item.id}" ${state.selectedPlan === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`
                      )
                      .join("")}
                  </select>
                </label>
                <label class="field">
                  <span>სქრინშოტი</span>
                  <input name="receipt" type="file" accept="image/*" required />
                </label>
                <button class="btn gold" type="submit">ატვირთვა და გაგზავნა</button>
              </form>
            `
            }
          </section>
        `
            : `
          <section class="panel">
            <span class="pill">აქტიური წვდომა</span>
            <h2>ქართული ლიტერატურის ბიბლიოთეკა</h2>
            <p class="lead">შენი აბონემენტი აქტიურია ${formatDate(state.userProfile?.subscriptionExpiresAt)}-მდე.</p>
            <div class="library-grid">
              ${state.authors
                .map(
                  (item) => `
                <article class="author-card">
                  <span class="pill subtle">${escapeHtml(item.era || "ავტორი")}</span>
                  <h3>${escapeHtml(item.name)}</h3>
                  <p class="meta">${escapeHtml(item.bio)}</p>
                  <button class="btn secondary" data-author="${item.id}" data-action="open-author">გახსნა</button>
                </article>
              `
                )
                .join("")}
            </div>
          </section>
          ${
            author && work
              ? `
            <section class="content-grid">
              <article class="panel">
                <span class="pill">${escapeHtml(author.name)}</span>
                <h2>${escapeHtml(work.title)}</h2>
                <p class="lead">${escapeHtml(author.bio)}</p>
                <div class="tab-row">
                  ${visibleTabs
                    .map(
                      ([key, tab]) => `
                    <button class="tab ${state.selectedTab === key ? "active" : ""}" data-tab="${key}" data-action="select-tab">${escapeHtml(tab.label)}</button>
                  `
                    )
                    .join("")}
                </div>
                <div class="work-body">${tabs[state.selectedTab]?.content || ""}</div>
              </article>
              <article class="panel">
                <span class="pill">ნაწარმოებები</span>
                <div class="list">
                  ${author.works
                    .map(
                      (item) => `
                    <div class="list-item">
                      <h3>${escapeHtml(item.title)}</h3>
                      <div class="inline-actions">
                        <button class="btn secondary" data-work="${item.id}" data-action="open-work">გახსნა</button>
                      </div>
                    </div>
                  `
                    )
                    .join("")}
                </div>
                ${
                  canSeeQuizzes()
                    ? `
                  <div style="margin-top:18px;">
                    <span class="pill">ქვიზები</span>
                    <div class="list" style="margin-top:12px;">
                      ${(work.quizzes || [])
                        .map(
                          (quiz, index) => `
                        <div class="list-item">
                          <strong>${index + 1}. ${escapeHtml(quiz.question)}</strong>
                          <p class="meta">${(quiz.options || []).map(escapeHtml).join(" • ")}</p>
                        </div>
                      `
                        )
                        .join("") || `<div class="empty">ამ ნაწარმოებს ქვიზები ჯერ არ აქვს დამატებული.</div>`}
                    </div>
                  </div>
                `
                    : `
                  <div class="empty" style="margin-top:18px;">ქვიზები ხელმისაწვდომია მხოლოდ 10 ლარიან პაკეტში.</div>
                `
                }
              </article>
            </section>
          `
              : ""
          }
        `
        }
      </section>
    </div>
  `;
};

const renderAdmin = () => {
  const pendingPayments = state.payments.filter((item) => item.status === "pending");
  return `
    <div class="dashboard">
      <aside class="panel sidebar">
        <span class="pill">Admin</span>
        <h2>${escapeHtml(state.userProfile?.fullName || "ადმინისტრატორი")}</h2>
        <p class="meta">${escapeHtml(state.user?.email || "")}</p>
        <div class="menu">
          <button class="active">ადმინ პანელი</button>
          <button data-action="seed">Seed კონტენტის ჩატვირთვა</button>
          <button data-action="theme-toggle">რეჟიმის შეცვლა</button>
          <button data-action="logout">გასვლა</button>
        </div>
      </aside>
      <section class="content admin-grid">
        <article class="panel">
          <span class="pill">მომხმარებლების მართვა</span>
          <h2>Pending გადახდები</h2>
          <div class="list">
            ${
              pendingPayments.length
                ? pendingPayments
                    .map(
                      (payment) => `
                  <div class="list-item">
                    <strong>${escapeHtml(payment.userName || payment.userEmail)}</strong>
                    <p class="meta">${escapeHtml(payment.planName)} • ${payment.price}₾ • ${formatDate(payment.createdAt?.toDate?.() || payment.createdAt)}</p>
                    <img class="payment-proof" src="${escapeHtml(payment.receiptUrl)}" alt="receipt" />
                    <div class="inline-actions" style="margin-top:12px;">
                      <button class="btn gold" data-payment="${payment.id}" data-action="approve-payment">დადასტურება</button>
                      <button class="btn warn" data-payment="${payment.id}" data-action="reject-payment">უარყოფა</button>
                    </div>
                  </div>
                `
                    )
                    .join("")
                : `<div class="empty">ამ ეტაპზე pending გადახდები არ არის.</div>`
            }
          </div>
        </article>
        <article class="panel">
          <span class="pill">კონტენტის მართვა</span>
          <h2>ავტორისა და ნაწარმოების დამატება</h2>
          <form id="author-form">
            <label class="field"><span>Author ID</span><input name="id" required /></label>
            <label class="field"><span>სახელი</span><input name="name" required /></label>
            <label class="field"><span>ეპოქა</span><input name="era" required /></label>
            <label class="field"><span>ბიოგრაფია</span><textarea name="bio" required></textarea></label>
            <button class="btn gold" type="submit">ავტორის დამატება</button>
          </form>
          <hr style="border:none;border-top:1px solid var(--line);margin:22px 0;" />
          <form id="work-form">
            <label class="field"><span>Author ID</span><input name="authorId" required /></label>
            <label class="field"><span>Work ID</span><input name="workId" required /></label>
            <label class="field"><span>სათაური</span><input name="title" required /></label>
            <label class="field"><span>შინაარსი</span><textarea name="summary" required></textarea></label>
            <label class="field"><span>განხილვა</span><textarea name="analysis" required></textarea></label>
            <label class="field"><span>დახასიათება</span><textarea name="characters" required></textarea></label>
            <label class="field"><span>გეგმა</span><textarea name="plan" required></textarea></label>
            <label class="field"><span>ციტატები</span><textarea name="quotes" required></textarea></label>
            <label class="field"><span>ქვიზები JSON-ად</span><textarea name="quizzes" placeholder='[{"question":"...","options":["A","B"],"answerIndex":0}]'></textarea></label>
            <button class="btn gold" type="submit">ნაწარმოების დამატება</button>
          </form>
        </article>
      </section>
    </div>
  `;
};

const renderApp = () => {
  const topbar = `
    <header class="topbar">
      <div class="brand">
        <div class="logo">მით<span class="logo-o"></span>სი</div>
        <div class="brand-copy">
          <strong>Mitosi</strong><br />
          <small>Modern Minimalist Library</small>
        </div>
      </div>
      <div class="actions">
        <button class="btn secondary" data-action="theme-toggle">${document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode"}</button>
        ${
          state.user
            ? `<button class="btn secondary" data-action="logout">გასვლა</button>`
            : `<button class="btn secondary" data-action="go-auth">ავტორიზაცია</button>`
        }
      </div>
    </header>
  `;

  if (state.bootError) {
    appRoot.innerHTML = `${topbar}<section class="panel" style="margin-top:18px;"><h2>Firebase Setup საჭიროა</h2><p class="lead">${escapeHtml(state.bootError)}</p></section>`;
    return;
  }

  const body =
    !state.user
      ? `${renderLanding()}<div style="margin-top:20px;">${renderAuth()}</div>`
      : state.userProfile?.role === "admin"
        ? renderAdmin()
        : renderStudentDashboard();

  appRoot.innerHTML = `${topbar}${body}<p class="footer-note">Mitosi • Firebase Auth + Firestore + Storage + Hosting-ready</p>`;
};

const attachEvents = () => {
  document.querySelector("#auth-form")?.addEventListener("submit", handleAuth);
  document.querySelector("#payment-form")?.addEventListener("submit", handlePaymentUpload);
  document.querySelector("#author-form")?.addEventListener("submit", handleAuthorCreate);
  document.querySelector("#work-form")?.addEventListener("submit", handleWorkCreate);

  appRoot.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", async () => {
      const { action, author, work, tab, payment, plan } = element.dataset;
      if (action === "go-auth") {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }
      if (action === "toggle-auth") {
        state.authMode = state.authMode === "login" ? "signup" : "login";
        render();
      }
      if (action === "theme-toggle") {
        setTheme(document.body.classList.contains("dark") ? "light" : "dark");
        render();
      }
      if (action === "logout") {
        await signOut(auth);
      }
      if (action === "open-author") {
        state.selectedAuthorId = author;
        state.selectedWorkId = state.authors.find((item) => item.id === author)?.works?.[0]?.id || null;
        state.selectedTab = "summary";
        render();
      }
      if (action === "open-work") {
        state.selectedWorkId = work;
        state.selectedTab = "summary";
        render();
      }
      if (action === "select-tab") {
        state.selectedTab = tab;
        render();
      }
      if (action === "select-plan") {
        state.selectedPlan = plan;
        render();
      }
      if (action === "approve-payment") {
        const found = state.payments.find((item) => item.id === payment);
        if (found) await approvePayment(found);
      }
      if (action === "reject-payment") {
        const found = state.payments.find((item) => item.id === payment);
        if (found) await rejectPayment(found);
      }
      if (action === "seed") {
        await ensureSeedData();
      }
    });
  });
};

const render = () => {
  renderApp();
  attachEvents();
};

const boot = async () => {
  initTheme();
  render();
  if (!auth) return;

  await ensureSeedData();
  subscribeAppData();

  onAuthStateChanged(auth, async (firebaseUser) => {
    state.authReady = true;
    state.user = firebaseUser;

    if (!firebaseUser) {
      state.userProfile = null;
      render();
      return;
    }

    await ensureUserProfile(firebaseUser);
    const snapshot = await getDoc(doc(db, "users", firebaseUser.uid));
    state.userProfile = snapshot.exists() ? await syncExpiryIfNeeded(snapshot.data()) : null;
    render();
  });
};

boot();
