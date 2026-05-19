import { curriculumData, defaultUserStatus } from "./data.js";

const STORAGE_KEYS = {
  users: "users",
  currentUser: "currentUser",
  pendingPayments: "pendingPayments",
};

const ADMIN_EMAIL = "giorgijavakhishvili75@gmail.com";
const FIREBASE_CURRICULUM_PATH = "curriculum";
const FIREBASE_PENDING_PAYMENTS_PATH = "pendingPayments";
const FIREBASE_USERS_PATH = "users";
const firebaseConfig = {
  apiKey: "AIzaSyDfHIssC0SbMkaADtLE64Y28DbjWzLoiJU",
  authDomain: "kalami-fe323.firebaseapp.com",
  databaseURL: "https://kalami-fe323-default-rtdb.firebaseio.com",
  projectId: "kalami-fe323",
  storageBucket: "kalami-fe323.firebasestorage.app",
  messagingSenderId: "1831718779",
  appId: "1:1831718779:web:d15a1ca6d0a4ee1a0577de",
  measurementId: "G-NFKNZX6K6S",
};

const state = {
  route: "landing",
  authMode: "signup",
  dashboardTab: "library",
  selectedAuthorId: null,
  selectedWorkId: null,
  paywallOpen: false,
  paymentOpen: false,
  selectedPlan: null,
  adminModalOpen: false,
  adminModalMode: null,
  editAuthorId: null,
  editWorkId: null,
  receiptPreview: null,
  users: [],
  currentUser: null,
  pendingPayments: [],
  library: [],
  curriculumLoading: true,
  curriculumError: "",
  paymentsError: "",
};

const app = document.querySelector("#app");
const firebaseNamespace = window.firebase;
let currentUserRef = null;
let currentUserListener = null;

if (!firebaseNamespace) {
  state.curriculumLoading = false;
  state.curriculumError = "Firebase ინიციალიზაცია ვერ შესრულდა.";
}

if (firebaseNamespace && !firebaseNamespace.apps.length) {
  firebaseNamespace.initializeApp(firebaseConfig);
}

const database = firebaseNamespace ? firebaseNamespace.database() : null;
const curriculumRef = database ? database.ref(FIREBASE_CURRICULUM_PATH) : null;
const usersRootRef = database ? database.ref(FIREBASE_USERS_PATH) : null;
const pendingPaymentsRootRef = database ? database.ref(FIREBASE_PENDING_PAYMENTS_PATH) : null;

const getData = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const setData = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const clone = (value) => JSON.parse(JSON.stringify(value));

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10a0-\u10ff]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeWork = (work) => ({
  ...work,
  summary: work.summary || "",
  characters: work.characters || "",
  structure: work.structure || "",
  questions: work.questions || work.context || "",
  context: work.context || work.questions || "",
});

const normalizeLibrary = (library) =>
  library.map((section) => ({
    ...section,
    authors: (section.authors || []).map((author) => ({
      ...author,
      era: author.era || section.category,
      bio: author.bio || "",
      works: (author.works || []).map(normalizeWork),
    })),
  }));

const getDefaultLibrary = () => normalizeLibrary(clone(curriculumData));

const getUserRef = (userId) => (usersRootRef && userId ? usersRootRef.child(String(userId)) : null);
const getPendingPaymentRef = (userId) =>
  pendingPaymentsRootRef && userId ? pendingPaymentsRootRef.child(String(userId)) : null;

const mergeUserIntoLocalState = (user) => {
  const normalizedUser = attachRole(user, true);
  const existingIndex = state.users.findIndex((item) => String(item.id) === String(normalizedUser.id));
  if (existingIndex === -1) {
    state.users.push(normalizedUser);
  } else {
    state.users[existingIndex] = { ...state.users[existingIndex], ...normalizedUser };
  }
  if (state.currentUser && String(state.currentUser.id) === String(normalizedUser.id)) {
    state.currentUser = { ...state.currentUser, ...normalizedUser };
    setData(STORAGE_KEYS.currentUser, state.currentUser);
  }
  persistUsers();
};

const syncUserProfileToCloud = async (user) => {
  const userRef = getUserRef(user.id);
  if (!userRef) return;
  await userRef.update({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    password: user.password,
    status: user.status,
    subscriptionPlan: user.subscriptionPlan || null,
    subscriptionApprovedAt: user.subscriptionApprovedAt || null,
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    role: attachRole(user, true).role,
  });
};

const unsubscribeCurrentUserNode = () => {
  if (currentUserRef && currentUserListener) {
    currentUserRef.off("value", currentUserListener);
  }
  currentUserRef = null;
  currentUserListener = null;
};

const subscribeCurrentUserNode = (userId) => {
  unsubscribeCurrentUserNode();
  const userRef = getUserRef(userId);
  if (!userRef) return;
  currentUserRef = userRef;
  currentUserListener = (snapshot) => {
    const cloudUser = snapshot.val();
    if (!cloudUser) return;
    mergeUserIntoLocalState(cloudUser);
    render();
  };
  userRef.on("value", currentUserListener);
};

const syncSessionUser = () => {
  if (!state.currentUser) return;
  const match = state.users.find((user) => user.email === state.currentUser.email);
  if (!match) {
    state.currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    return;
  }
  state.currentUser = attachRole(match, true);
  setData(STORAGE_KEYS.currentUser, state.currentUser);
};

const attachRole = (user, enableAdminHook = false) => ({
  ...user,
  role: enableAdminHook && user.email === ADMIN_EMAIL ? "admin" : user.role || "student",
});

const initState = () => {
  state.users = getData(STORAGE_KEYS.users, []);
  state.pendingPayments = [];
  state.library = [];
  refreshSubscriptionStatuses();
  const existingUser = getData(STORAGE_KEYS.currentUser, null);
  state.currentUser = existingUser ? attachRole(existingUser, true) : null;
  syncSessionUser();
  if (state.currentUser) {
    state.route = "dashboard";
    subscribeCurrentUserNode(state.currentUser.id);
  }
};

const persistUsers = () => {
  setData(STORAGE_KEYS.users, state.users);
  syncSessionUser();
};

const findAuthorById = (authorId) => {
  for (const section of state.library) {
    const author = section.authors.find((item) => item.id === authorId);
    if (author) return { section, author };
  }
  return null;
};

const getSelectedAuthor = () => {
  if (!state.selectedAuthorId) return null;
  return findAuthorById(state.selectedAuthorId)?.author || null;
};

const getSelectedWork = () => {
  const author = getSelectedAuthor();
  if (!author || !state.selectedWorkId) return null;
  return author.works.find((work) => work.id === state.selectedWorkId) || null;
};

const closeAdminModalState = () => {
  state.adminModalOpen = false;
  state.adminModalMode = null;
  state.editAuthorId = null;
  state.editWorkId = null;
};

const closeReceiptPreview = () => {
  state.receiptPreview = null;
};

const getFirebaseErrorMessage = (error, fallback) => {
  const code = error?.code ? ` (${error.code})` : "";
  const message = error?.message || fallback;
  return `${message}${code}`;
};

const normalizePendingPayments = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.values(value).filter(Boolean);
};

const writeCurriculumToCloud = async (nextLibrary) => {
  if (!curriculumRef) {
    state.curriculumError = "Firebase კავშირი ვერ დამყარდა.";
    throw new Error("Firebase database is not available.");
  }
  await curriculumRef.set(nextLibrary);
};

const subscribeToCurriculum = () => {
  if (!curriculumRef) {
    state.curriculumLoading = false;
    state.curriculumError = "Firebase ინიციალიზაცია ვერ შესრულდა.";
    render();
    return;
  }

  curriculumRef.on(
    "value",
    (snapshot) => {
      const remoteValue = snapshot.val();
      if (!remoteValue) {
        state.library = [];
        state.curriculumError = "";
      } else {
        state.library = normalizeLibrary(remoteValue);
        state.curriculumError = "";
      }
      state.curriculumLoading = false;
      render();
    },
    (error) => {
      state.curriculumLoading = false;
      state.curriculumError = getFirebaseErrorMessage(
        error,
        "ბიბლიოთეკის სინქრონიზაცია ვერ მოხერხდა."
      );
      render();
    }
  );
};

const subscribeToPendingPayments = () => {
  if (!pendingPaymentsRootRef) {
    state.paymentsError = "Firebase ინიციალიზაცია ვერ შესრულდა.";
    render();
    return;
  }

  pendingPaymentsRootRef.on(
    "value",
    (snapshot) => {
      state.pendingPayments = normalizePendingPayments(snapshot.val());
      state.paymentsError = "";
      render();
    },
    (error) => {
      state.pendingPayments = [];
      state.paymentsError = getFirebaseErrorMessage(
        error,
        "გადახდების სინქრონიზაცია ვერ მოხერხდა."
      );
      render();
    }
  );
};

const isPremium = () => state.currentUser && (state.currentUser.status === "premium" || state.currentUser.role === "admin");
const isPending = () => state.currentUser && state.currentUser.status === "pending";
const isAdmin = () => state.currentUser && state.currentUser.role === "admin";

const PLAN_DURATIONS = {
  "5": 30,
  "10": 30,
};

const planCatalog = {
  "5": {
    name: "5 ლარი",
    price: "5 ლარი / თვე",
    summary: "სრული სასწავლო ბიბლიოთეკა ერთ სივრცეში.",
    durationDays: PLAN_DURATIONS["5"],
    features: [
      "ნაწარმოებების შინაარსები",
      "ავტორების ბიოგრაფიები",
      "პერსონაჟების ანალიზი",
      "სტრუქტურა და ისტორიული კონტექსტი",
    ],
  },
  "10": {
    name: "10 ლარი",
    price: "10 ლარი / თვე",
    summary: "ყველაფერი, რაც 5-ლარიან გეგმაშია, დამატებითი პრაქტიკით.",
    durationDays: PLAN_DURATIONS["10"],
    features: [
      "ნაწარმოებების შინაარსები",
      "ავტორების ბიოგრაფიები",
      "პერსონაჟების ანალიზი",
      "სტრუქტურა და ისტორიული კონტექსტი",
      "ქვიზები",
      "ტესტირება",
    ],
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatDate = (value) => {
  if (!value) return "არ არის";
  return new Date(value).toLocaleDateString("ka-GE");
};

const getDaysLeft = (value) => {
  if (!value) return 0;
  return Math.max(0, Math.ceil((value - Date.now()) / DAY_MS));
};

const getPlanName = (planId) => planCatalog[planId]?.name || "გეგმა";

const refreshSubscriptionStatuses = () => {
  let changed = false;
  state.users = state.users.map((user) => {
    if (!user.subscriptionExpiresAt) return user;
    if (user.role === "admin") return user;
    if (user.subscriptionExpiresAt <= Date.now() && user.status === "premium") {
      changed = true;
      return {
        ...user,
        status: "free",
        subscriptionPlan: null,
        subscriptionApprovedAt: null,
        subscriptionExpiresAt: null,
      };
    }
    return user;
  });
  if (changed) persistUsers();
};

const updateCurrentUserStatus = (status) => {
  if (!state.currentUser) return;
  state.users = state.users.map((user) =>
    user.email === state.currentUser.email ? { ...user, status } : user
  );
  persistUsers();
  syncUserProfileToCloud({ ...state.currentUser, status }).catch(() => {});
};

const setRoute = (route) => {
  state.route = route;
  render();
};

const signOut = () => {
  unsubscribeCurrentUserNode();
  state.currentUser = null;
  state.route = "landing";
  state.dashboardTab = "library";
  state.selectedAuthorId = null;
  state.selectedWorkId = null;
  closeAdminModalState();
  closeReceiptPreview();
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  render();
};

const handleSignup = async (formData) => {
  const firstName = formData.get("firstName").trim();
  const lastName = formData.get("lastName").trim();
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();

  if (!firstName || !lastName || !email || !password) {
    alert("გთხოვთ შეავსოთ ყველა ველი.");
    return;
  }

  if (state.users.some((user) => user.email === email)) {
    alert("ამ ელ-ფოსტით მომხმარებელი უკვე არსებობს.");
    return;
  }

  const newUser = attachRole({
    id: Date.now(),
    firstName,
    lastName,
    email,
    password,
    status: defaultUserStatus,
    subscriptionPlan: null,
    subscriptionApprovedAt: null,
    subscriptionExpiresAt: null,
  });

  state.users.push(newUser);
  persistUsers();
  state.currentUser = newUser;
  setData(STORAGE_KEYS.currentUser, newUser);
  try {
    await syncUserProfileToCloud(newUser);
    subscribeCurrentUserNode(newUser.id);
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "მომხმარებლის სინქრონიზაცია ვერ მოხერხდა."));
  }
  state.route = "dashboard";
  state.paymentOpen = Boolean(state.selectedPlan);
  render();
};

const handleLogin = async (formData) => {
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();
  const user = state.users.find((item) => item.email === email && item.password === password);

  if (!user) {
    alert("ელ-ფოსტა ან პაროლი არასწორია.");
    return;
  }

  const sessionUser = attachRole(user, true);
  state.currentUser = sessionUser;
  setData(STORAGE_KEYS.currentUser, sessionUser);
  try {
    await syncUserProfileToCloud(sessionUser);
    subscribeCurrentUserNode(sessionUser.id);
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "მომხმარებლის სინქრონიზაცია ვერ მოხერხდა."));
  }
  state.route = "dashboard";
  state.paymentOpen = Boolean(state.selectedPlan);
  render();
};

const openWork = (authorId, workId) => {
  state.selectedAuthorId = authorId;
  state.selectedWorkId = workId;
  state.dashboardTab = "library";
  state.paywallOpen = !isPremium();
  render();
};

const submitPayment = async (event) => {
  event.preventDefault();
  if (!state.currentUser) return;

  const form = event.currentTarget;
  const screenshot = form.dataset.base64;
  const senderName = form.senderName.value.trim();

  if (!screenshot) {
    alert("გთხოვთ ატვირთოთ ქვითრის ფოტო.");
    return;
  }

  const packet = {
    id: Date.now(),
    studentName: `${state.currentUser.firstName} ${state.currentUser.lastName}`,
    studentEmail: state.currentUser.email,
    receiptImage: screenshot,
    userId: state.currentUser.id,
    email: state.currentUser.email,
    firstName: state.currentUser.firstName,
    lastName: state.currentUser.lastName,
    senderName,
    screenshot,
    planId: state.selectedPlan || "5",
    approvedAt: null,
    expiresAt: null,
    status: "pending",
  };

  const paymentRef = getPendingPaymentRef(state.currentUser.id);
  if (!paymentRef) {
    alert("ქვითრის გაგზავნა ვერ მოხერხდა.");
    return;
  }

  try {
    await paymentRef.set(packet);
    state.paymentsError = "";
    updateCurrentUserStatus("pending");
    alert("ქვითარი წარმატებით გაიგზავნა.");
    state.paymentOpen = false;
    state.selectedPlan = null;
    state.paywallOpen = true;
    render();
  } catch (error) {
    state.paymentsError = getFirebaseErrorMessage(error, "ქვითრის გაგზავნა ვერ მოხერხდა.");
    alert(getFirebaseErrorMessage(error, "ქვითრის გაგზავნა ვერ მოხერხდა."));
  }
};

const handleFileChange = (input, form) => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    form.dataset.base64 = String(reader.result);
    const nameNode = form.querySelector(".file-chip");
    if (nameNode) nameNode.textContent = file.name;
  };
  reader.readAsDataURL(file);
};

const approvePayment = async (paymentId, nextStatus) => {
  const request = state.pendingPayments.find((item) => Number(item.id) === paymentId);
  if (!request) return;

  const planDuration = planCatalog[request.planId]?.durationDays || 30;
  const approvedAt = Date.now();
  const expiresAt = approvedAt + planDuration * DAY_MS;

  const userRef = getUserRef(request.userId);
  const paymentRef = getPendingPaymentRef(request.userId);
  if (!userRef || !paymentRef) return;

  try {
    await userRef.update(
      nextStatus === "premium"
        ? {
            status: "premium",
            approvedAt,
            subscriptionPlan: request.planId,
            subscriptionApprovedAt: approvedAt,
            subscriptionExpiresAt: expiresAt,
          }
        : {
            status: "free",
            approvedAt: null,
            subscriptionPlan: null,
            subscriptionApprovedAt: null,
            subscriptionExpiresAt: null,
          }
    );
    await paymentRef.remove();
    state.paymentsError = "";
    closeReceiptPreview();
    alert(
      nextStatus === "premium"
        ? "მომხმარებელი წარმატებით გააქტიურდა."
        : "ქვითარი უარყოფილია და სტატუსი განულდა."
    );
    render();
  } catch (error) {
    state.paymentsError = getFirebaseErrorMessage(error, "გადახდის განახლება ვერ მოხერხდა.");
    alert(getFirebaseErrorMessage(error, "გადახდის განახლება ვერ მოხერხდა."));
  }
};

const previewReceipt = (paymentId) => {
  const request = state.pendingPayments.find((item) => item.id === paymentId);
  if (!request) return;
  state.receiptPreview = request;
  render();
};

const saveAuthor = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const editorData = state.editAuthorId ? getSelectedEditorData() : null;
  const categoryId = form.categoryId?.value || editorData?.section?.id;
  const name = form.name.value.trim();
  const era = form.era.value.trim();
  const bio = form.bio.value.trim();
  const portrait = form.dataset.base64 || form.portraitUrl.value.trim();
  const authorId = state.editAuthorId || `${slugify(name) || "author"}-${Date.now()}`;

  if (!name || !era || !bio) {
    alert("გთხოვთ შეავსოთ ავტორის სახელი, ეპოქა და ბიოგრაფია.");
    return;
  }

  if (!state.editAuthorId && !categoryId) {
    alert("გთხოვთ აირჩიოთ კატეგორია.");
    return;
  }

  if (state.editAuthorId) {
    state.library = state.library.map((section) => ({
      ...section,
      authors: section.authors.map((author) => {
        if (author.id !== state.editAuthorId) return author;
        return { ...author, name, era, bio, portrait };
      }),
    }));
  } else {
    state.library = state.library.map((section) =>
      section.id !== categoryId
        ? section
        : {
            ...section,
            authors: [
              ...section.authors,
              {
                id: authorId,
                name,
                era,
                bio,
                portrait,
                works: [],
              },
            ],
          }
    );
    state.selectedAuthorId = authorId;
    state.selectedWorkId = null;
  }

  try {
    await writeCurriculumToCloud(state.library);
    closeAdminModalState();
    alert("ავტორი წარმატებით შენახულია.");
    render();
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "ავტორის შენახვა Firebase-ში ვერ მოხერხდა."));
  }
};

const saveWork = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const authorId = state.editAuthorId;
  if (!authorId) return;

  const title = form.title.value.trim();
  const summary = form.summary.value.trim();
  const characters = form.characters.value.trim();
  const structure = form.structure.value.trim();
  const questions = form.questions.value.trim();
  const action = event.submitter?.dataset.action || "draft";

  if (!title) {
    alert("გთხოვთ შეავსოთ ნაწარმოების სათაური.");
    return;
  }

  const workId = state.editWorkId || `${slugify(title) || "work"}-${Date.now()}`;
  const nextWork = normalizeWork({
    id: workId,
    title,
    summary,
    characters,
    structure,
    questions,
    context: questions,
    visibility: action === "publish" ? "published" : "draft",
    updatedAt: Date.now(),
  });

  state.library = state.library.map((section) => ({
    ...section,
    authors: section.authors.map((author) => {
      if (author.id !== authorId) return author;
      const existingIndex = author.works.findIndex((work) => work.id === workId);
      if (existingIndex === -1) {
        return { ...author, works: [...author.works, nextWork] };
      }
      const works = [...author.works];
      works[existingIndex] = { ...works[existingIndex], ...nextWork };
      return { ...author, works };
    }),
  }));

  state.selectedAuthorId = authorId;
  state.selectedWorkId = workId;
  try {
    await writeCurriculumToCloud(state.library);
    closeAdminModalState();
    alert(action === "publish" ? "ნაწარმოები გამოქვეყნდა." : "ნაწარმოები შენახულია.");
    render();
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "ნაწარმოების შენახვა Firebase-ში ვერ მოხერხდა."));
  }
};

const openAdminEditor = (mode, authorId = null, workId = null) => {
  state.adminModalMode = mode;
  state.editAuthorId = authorId;
  state.editWorkId = workId;
  state.adminModalOpen = true;
  render();
};

const navigationMarkup = () => {
  if (!state.currentUser) return "";
  const tabs = [
    { id: "library", label: "ბიბლიოთეკა" },
    { id: "profile", label: "პროფილი" },
  ];

  if (isAdmin()) tabs.push({ id: "payments", label: "🔔 გადახდების მართვა" });

  return `
    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-badge">კ</div>
        <div>
          <h1>კალამი</h1>
          <p>აბიტურიენტთა ეროვნული ბიბლიოთეკა 2026</p>
        </div>
      </div>
      <nav class="nav-tabs">
        ${tabs
          .map(
            (tab) => `
              <button class="nav-tab ${state.dashboardTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
                ${tab.label}
              </button>
            `
          )
          .join("")}
      </nav>
      <div class="topbar-actions">
        <div class="status-pill ${state.currentUser.status}">
          ${
            isAdmin()
              ? "ადმინისტრატორი"
              : state.currentUser.status === "premium"
              ? "Premium"
              : state.currentUser.status === "pending"
              ? "განხილვაში"
              : "Free"
          }
        </div>
        <button class="icon-button" id="logoutBtn" aria-label="გასვლა">⎋</button>
      </div>
    </header>
  `;
};

const landingMarkup = () => `
  <section class="landing-shell">
    <div class="hero-panel">
      <div class="hero-copy">
        <span class="eyebrow">Kalami.ge • 2026 ეროვნული გამოცდები</span>
        <h1>ყველაფერი ქართული ლიტერატურის სრულყოფილად გასაგებად, ერთ სივრცეში.</h1>
        <p>
          კალამი აერთიანებს ქართულ ლიტერატურას ერთ მოწესრიგებულ სივრცეში: სიუჟეტური შეჯამებები,
          პერსონაჟთა ანალიზი, სტრუქტურული რუკები და ისტორიული კონტექსტი მხოლოდ 5 ლარად თვეში.
        </p>
      </div>
      <div class="hero-stats hero-stats-vertical">
        <article><strong>40+</strong><span>ავტორი და ტექსტი</span></article>
        <article><strong>100%</strong><span>სანდო და მოწესრიგებული</span></article>
        <article><strong>5 GEL</strong><span>სრული წვდომა / თვე</span></article>
      </div>
    </div>
    <div class="gateway-grid">
      <section class="auth-card">
        <div class="switch-row">
          <button class="switch-btn ${state.authMode === "signup" ? "active" : ""}" data-auth="signup">რეგისტრაცია</button>
          <button class="switch-btn ${state.authMode === "login" ? "active" : ""}" data-auth="login">შესვლა</button>
        </div>
        ${
          state.authMode === "signup"
            ? `
            <form id="signupForm" class="stack-form">
              <label><span>სახელი</span><input name="firstName" type="text" required /></label>
              <label><span>გვარი</span><input name="lastName" type="text" required /></label>
              <label><span>ელ-ფოსტა</span><input name="email" type="email" required /></label>
              <label><span>პაროლი</span><input name="password" type="password" required /></label>
              <button type="submit" class="primary-btn">ანგარიშის შექმნა</button>
            </form>
          `
            : `
            <form id="loginForm" class="stack-form">
              <label><span>ელ-ფოსტა</span><input name="email" type="email" required /></label>
              <label><span>პაროლი</span><input name="password" type="password" required /></label>
              <button type="submit" class="primary-btn">შესვლა</button>
            </form>
          `
        }
      </section>
    </div>
    <section class="pricing-grid pricing-grid-landing">
      <article class="pricing-card pricing-tier">
        <h3>უფასო</h3>
        <p>დაათვალიერე ბიბლიოთეკა, ავტორები და თემატური კატეგორიები საწყისი ორიენტაციისთვის.</p>
        <div class="mini-price">0 ლარი</div>
      </article>
      <article class="pricing-card pricing-tier premium">
        <div class="plan-badge subtle">ყველაზე მოთხოვნადი</div>
        <h3>5 ლარი / თვე</h3>
        <p>სრული წვდომა ლიტერატურის ძირითად მასალებზე.</p>
        <button class="primary-btn" data-open-plan="5">გამოწერა</button>
      </article>
      <article class="pricing-card pricing-tier premium">
        <div class="plan-badge subtle">მაქსიმალური პაკეტი</div>
        <h3>10 ლარი / თვე</h3>
        <p>სრული წვდომა დამატებით ქვიზებითა და ტესტირებით.</p>
        <button class="primary-btn" data-open-plan="10">გამოწერა</button>
      </article>
    </section>
  </section>
`;

const renderLibraryGrid = () =>
  state.library
    .map(
      (section) => `
        <section class="library-section">
          <div class="section-head">
            <div>
              <span class="section-tag">${section.category}</span>
              <h3>${section.category}</h3>
            </div>
            <div class="section-actions">
              <span class="section-count">${section.authors.length} ავტორი</span>
              ${
                isAdmin()
                  ? `<button class="add-inline-btn" data-add-author="${section.id}" aria-label="ახალი ავტორი">+</button>`
                  : ""
              }
            </div>
          </div>
          <div class="author-grid">
            ${section.authors
              .map(
                (author) => `
                <article class="author-card">
                  <div class="author-top">
                    <div class="avatar-wrap">
                      ${
                        author.portrait
                          ? `<img src="${author.portrait}" alt="${author.name}" class="avatar-img" />`
                          : `<div class="avatar-fallback">${author.name.charAt(0)}</div>`
                      }
                    </div>
                    <div>
                      <h4>${author.name}</h4>
                      <p>${author.era || section.category}</p>
                    </div>
                  </div>
                  <p>${author.bio || "ბიოგრაფია ჯერ არ არის დამატებული."}</p>
                  <div class="work-list">
                    ${author.works
                      .map(
                        (work) => `
                          <button class="work-chip" data-author="${author.id}" data-work="${work.id}">
                            ${work.title}
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                  ${
                    isAdmin()
                      ? `<button class="secondary-btn edit-author-btn" data-edit-author="${author.id}">რედაქტირება</button>`
                      : ""
                  }
                </article>
              `
              )
              .join("")}
          </div>
        </section>
      `
    )
    .join("");

const renderWorkPanel = () => {
  const authorData = state.selectedAuthorId ? findAuthorById(state.selectedAuthorId) : null;
  const author = authorData?.author || null;
  const section = authorData?.section || null;
  const work = getSelectedWork();

  if (!author) {
    return `
      <aside class="detail-panel empty-state">
        <h3>შეარჩიე ნაწარმოები</h3>
        <p>ბიბლიოთეკიდან დააჭირე ნებისმიერ ტექსტს და აქ გაიხსნება მისი ანალიტიკური ბარათი.</p>
      </aside>
    `;
  }

  if (!work) {
    return `
      <aside class="detail-panel">
        <div class="detail-header admin-detail-head">
          <div>
            <span class="section-tag">${section?.category || "ავტორი"}</span>
            <h3>${author.name}</h3>
            <p class="detail-subtitle">${author.era || section?.category || ""}</p>
          </div>
          ${
            isAdmin()
              ? `<button class="accent-btn" data-add-work="${author.id}">+ ახალი ნაწარმოების დამატება</button>`
              : ""
          }
        </div>
        <div class="detail-block">
          <h4>ნაწარმოებების სია</h4>
          <p>აირჩიე უკვე დამატებული ტექსტი ან დაამატე ახალი ნაწარმოები ადმინისტრაციული პანელიდან.</p>
          <div class="work-list">
            ${author.works
              .map(
                (item) => `
                  <button class="work-chip" data-author="${author.id}" data-work="${item.id}">
                    ${item.title}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      </aside>
    `;
  }

  return `
    <aside class="detail-panel ${!isPremium() ? "blurred" : ""}">
      <div class="detail-header admin-detail-head">
        <div>
          <span class="section-tag">${author.name}</span>
          <h3>${work.title}</h3>
          <p class="detail-subtitle">${author.era || section?.category || ""}</p>
        </div>
        <div class="detail-actions">
          ${
            isAdmin()
              ? `<button class="secondary-btn" data-edit-work="${author.id}|${work.id}">რედაქტირება</button>
                 <button class="accent-btn" data-add-work="${author.id}">+ ახალი ნაწარმოების დამატება</button>`
              : ""
          }
          ${
            !isPremium()
              ? `<button class="accent-btn" id="openPaymentFromHeader">💳 ქვითრის ატვირთვა</button>`
              : ""
          }
        </div>
      </div>
      <div class="detail-block">
        <h4>შინაარსი</h4>
        <p>${work.summary}</p>
      </div>
      <div class="detail-block">
        <h4>პერსონაჟთა დახასიათება</h4>
        <p>${work.characters}</p>
      </div>
      <div class="detail-block">
        <h4>გეგმა და სტრუქტურა</h4>
        <p>${work.structure}</p>
      </div>
      <div class="detail-block">
        <h4>გასაანალიზებელი კითხვები</h4>
        <p>${work.questions || work.context}</p>
      </div>
      ${
        state.paywallOpen && !isPremium()
          ? `
            <div class="paywall-overlay">
              <div class="paywall-card">
                <span class="premium-lock">Premium</span>
                <h4>სრული წვდომა შეზღუდულია</h4>
                <p>პლატფორმის სრული წვდომისთვის გთხოვთ გადარიცხოთ 5 ლარი მითითებულ ანგარიშზე.</p>
                <strong>საქართველოს ბანკი (BOG): GE928G0000000612371503</strong>
                <div class="paywall-actions">
                  <button class="primary-btn" id="openPaymentModal">💳 ქვითრის ატვირთვა</button>
                  <button class="ghost-btn" id="closePaywall">დახურვა</button>
                </div>
                ${
                  isPending()
                    ? `<small>თქვენი ქვითარი განხილვის პროცესშია.</small>`
                    : ""
                }
              </div>
            </div>
          `
          : ""
      }
    </aside>
  `;
};

const libraryMarkup = () => `
  <section class="library-shell">
    <div class="library-column">
      <div class="library-header">
        <div>
          <span class="eyebrow">ბიბლიოთეკა</span>
          <h2>2026 ეროვნული პროგრამა</h2>
        </div>
        ${
          isAdmin()
            ? `<button class="add-btn" id="openNewAuthorModal" aria-label="ახალი ავტორი">+</button>`
            : ""
        }
      </div>
      ${
        state.curriculumLoading
          ? `<div class="sync-banner">ბიბლიოთეკა იტვირთება Firebase-დან...</div>`
          : ""
      }
      ${
        state.curriculumError
          ? `<div class="sync-banner error">${state.curriculumError}</div>`
          : ""
      }
      ${renderLibraryGrid()}
    </div>
  </section>
`;

const profileMarkup = () => `
  <section class="profile-shell">
    <article class="profile-card wide">
      <span class="section-tag">ჩემი პროფილი</span>
      <h2>${state.currentUser.firstName} ${state.currentUser.lastName}</h2>
      <p>${state.currentUser.email}</p>
      <div class="profile-meta">
        <div><strong>სტატუსი</strong><span>${state.currentUser.status}</span></div>
        <div><strong>წვდომა</strong><span>${isPremium() ? "სრული" : "შეზღუდული"}</span></div>
        <div><strong>გეგმა</strong><span>${state.currentUser.subscriptionPlan ? getPlanName(state.currentUser.subscriptionPlan) : "არ არის აქტიური"}</span></div>
        <div><strong>დარჩენილი დღეები</strong><span>${state.currentUser.subscriptionExpiresAt ? `${getDaysLeft(state.currentUser.subscriptionExpiresAt)} დღე` : "-"}</span></div>
      </div>
      <button class="accent-btn" id="openPaymentFromProfile">💳 ქვითრის ატვირთვა</button>
      ${
        isPending()
          ? `<div class="pending-note">თქვენი ქვითარი განხილვის პროცესშია.</div>`
          : ""
      }
    </article>
    <article class="profile-card">
      <span class="section-tag">აქტივაცია</span>
      <h3>Bank of Georgia</h3>
      <p>პლატფორმის სრული წვდომისთვის გთხოვთ გადარიცხოთ 5 ლარი მითითებულ ანგარიშზე.</p>
      <strong>საქართველოს ბანკი (BOG): GE928G0000000612371503</strong>
    </article>
  </section>
`;

const paymentsMarkup = () => `
  <section class="payments-shell">
    ${(() => {
      const pendingRequests = state.pendingPayments.filter((payment) => payment.status === "pending");
      return `
    <div class="library-header">
      <div>
        <span class="eyebrow">ადმინისტრაცია</span>
        <h2>გადახდების მართვა</h2>
      </div>
      <div class="status-pill pending">${pendingRequests.length} მოთხოვნა</div>
    </div>
    <div class="payments-section">
      <h3>მოსული გადახდების გადამოწმება</h3>
      ${
        state.paymentsError
          ? `<div class="sync-banner error">${state.paymentsError}</div>`
          : ""
      }
      <div class="payments-table-wrap">
      ${
        pendingRequests.length
          ? pendingRequests
              .map((payment) => `
                <article class="payment-row">
                  <div>
                    <strong>${payment.studentName || `${payment.firstName} ${payment.lastName}`}</strong>
                    <p>${payment.senderName || payment.studentName || "-"}</p>
                  </div>
                  <div>
                    <strong>${payment.studentEmail || payment.email}</strong>
                    <p>${getPlanName(payment.planId)}</p>
                  </div>
                  <button class="receipt-thumb-btn" data-preview-receipt="${payment.id}">
                    <img src="${payment.receiptImage || payment.screenshot}" alt="ქვითარი" class="payment-thumb" />
                    <span>ქვითრის გახსნა</span>
                  </button>
                  <div class="payment-actions">
                    <button class="primary-btn" data-approve="${payment.id}">დამტკიცება</button>
                    <button class="secondary-btn" data-deny="${payment.id}">უარყოფა</button>
                  </div>
                </article>
              `)
              .join("")
          : `<div class="empty-payments">ამ ეტაპზე ახალი გადახდის მოთხოვნები არ არის.</div>`
      }
      </div>
    </div>
    `;
    })()}
  </section>
`;

const paymentModalMarkup = () => {
  if (!state.paymentOpen || !state.currentUser) return "";
  const plan = planCatalog[state.selectedPlan || "5"] || planCatalog["5"];
  return `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <span class="section-tag premium-lock">აქტივაცია</span>
            <h3>${plan.name} გეგმის აქტივაცია</h3>
          </div>
          <button class="icon-button" id="closePaymentModal">✕</button>
        </div>
        <p>${plan.summary}</p>
        <div class="detail-block">
          <h4>რა შედის გეგმაში</h4>
          <ul class="plan-list">
            ${plan.features.map((feature) => `<li>${feature}</li>`).join("")}
          </ul>
        </div>
        <p>აქტივაციისთვის გთხოვთ გადარიცხოთ <strong>${plan.price}</strong>.</p>
        <strong>საქართველოს ბანკი (BOG): GE928G0000000612371503</strong>
        <form id="paymentForm" class="stack-form">
          <label>
            <span>გადამხდელის სახელი და გვარი</span>
            <input name="senderName" type="text" value="${state.currentUser.firstName} ${state.currentUser.lastName}" required />
          </label>
          <label class="file-label">
            <span>ქვითრის ფოტო</span>
            <input name="screenshot" id="screenshotInput" type="file" accept="image/*" required />
            <small class="file-chip">ფაილი არჩეული არ არის</small>
          </label>
          <button type="submit" class="primary-btn">გაგზავნა</button>
        </form>
      </div>
    </div>
  `;
};

const adminModalMarkup = () => {
  if (!state.adminModalOpen) return "";
  const selected = state.editAuthorId ? getSelectedEditorData() : null;
  const selectedWork =
    state.editAuthorId && state.editWorkId
      ? selected?.author.works.find((work) => work.id === state.editWorkId) || null
      : null;

  if (state.adminModalMode === "work") {
    return `
      <div class="modal-backdrop">
        <div class="modal-card large">
          <div class="modal-head">
            <div>
              <span class="section-tag">${state.editWorkId ? "რედაქტირება" : "ახალი ტექსტი"}</span>
              <h3>${state.editWorkId ? "ნაწარმოების რედაქტირება" : "ახალი ნაწარმოების დამატება"}</h3>
            </div>
            <button class="icon-button" id="closeAdminModal">✕</button>
          </div>
          <form id="workForm" class="stack-form">
            <label>
              <span>ნაწარმოების სათაური</span>
              <input name="title" type="text" value="${selectedWork?.title || ""}" required />
            </label>
            <label>
              <span>შინაარსი</span>
              <textarea name="summary" rows="4">${selectedWork?.summary || ""}</textarea>
            </label>
            <label>
              <span>პერსონაჟთა დახასიათება</span>
              <textarea name="characters" rows="4">${selectedWork?.characters || ""}</textarea>
            </label>
            <label>
              <span>გეგმა და სტრუქტურა</span>
              <textarea name="structure" rows="4">${selectedWork?.structure || ""}</textarea>
            </label>
            <label>
              <span>გასაანალიზებელი კითხვები</span>
              <textarea name="questions" rows="4">${selectedWork?.questions || selectedWork?.context || ""}</textarea>
            </label>
            <div class="modal-action-row">
              <button type="submit" class="secondary-btn" data-action="draft">შენახვა</button>
              <button type="submit" class="primary-btn" data-action="publish">გამოქვეყნება</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <span class="section-tag">${state.editAuthorId ? "რედაქტირება" : "ახალი ჩანაწერი"}</span>
            <h3>${state.editAuthorId ? "ავტორის განახლება" : "ახალი ავტორის დამატება"}</h3>
          </div>
          <button class="icon-button" id="closeAdminModal">✕</button>
        </div>
        <form id="authorForm" class="stack-form">
          ${
            state.editAuthorId
              ? ""
              : `
                <label>
                  <span>კატეგორია</span>
                  <select name="categoryId">
                    ${state.library
                      .map(
                        (section) => `
                          <option value="${section.id}" ${selected?.section.id === section.id ? "selected" : ""}>${section.category}</option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
              `
          }
          <label>
            <span>ავტორის სახელი და გვარი</span>
            <input name="name" type="text" value="${selected?.author.name || ""}" required />
          </label>
          <label>
            <span>ეპოქა</span>
            <input name="era" type="text" value="${selected?.author.era || selected?.section.category || ""}" required />
          </label>
          <label>
            <span>ბიოგრაფია</span>
            <textarea name="bio" rows="4" required>${selected?.author.bio || ""}</textarea>
          </label>
          <label>
            <span>პორტრეტის URL</span>
            <input name="portraitUrl" type="text" value="${selected?.author.portrait || ""}" />
          </label>
          <label class="file-label">
            <span>პორტრეტის ატვირთვა</span>
            <input name="portraitFile" id="portraitInput" type="file" accept="image/*" />
            <small class="file-chip">ატვირთვა სურვილისამებრ</small>
          </label>
          <button type="submit" class="primary-btn">შენახვა</button>
        </form>
      </div>
    </div>
  `;
};

const receiptPreviewMarkup = () => {
  if (!state.receiptPreview) return "";
  return `
    <div class="modal-backdrop">
      <div class="modal-card receipt-modal">
        <div class="modal-head">
          <div>
            <span class="section-tag premium-lock">ქვითრის გადამოწმება</span>
            <h3>${state.receiptPreview.studentName || `${state.receiptPreview.firstName} ${state.receiptPreview.lastName}`}</h3>
          </div>
          <button class="icon-button" id="closeReceiptPreview">✕</button>
        </div>
        <div class="receipt-preview-meta">
          <p><strong>ელ-ფოსტა:</strong> ${state.receiptPreview.studentEmail || state.receiptPreview.email}</p>
          <p><strong>გეგმა:</strong> ${getPlanName(state.receiptPreview.planId)}</p>
        </div>
        <img src="${state.receiptPreview.receiptImage || state.receiptPreview.screenshot}" alt="ქვითარი" class="receipt-preview-image" />
      </div>
    </div>
  `;
};

const getSelectedEditorData = () => findAuthorById(state.editAuthorId);

const dashboardMarkup = () => `
  <div class="app-shell">
    ${navigationMarkup()}
    <main class="main-shell">
      ${state.dashboardTab === "library" ? libraryMarkup() : ""}
      ${state.dashboardTab === "profile" ? profileMarkup() : ""}
      ${state.dashboardTab === "payments" && isAdmin() ? paymentsMarkup() : ""}
    </main>
    ${paymentModalMarkup()}
    ${adminModalMarkup()}
    ${receiptPreviewMarkup()}
  </div>
`;

const render = () => {
  refreshSubscriptionStatuses();
  app.innerHTML = state.route === "landing" ? landingMarkup() : dashboardMarkup();
  bindEvents();
};

const bindEvents = () => {
  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.auth;
      render();
    });
  });

  const signupForm = document.querySelector("#signupForm");
  if (signupForm) signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSignup(new FormData(signupForm));
  });

  const loginForm = document.querySelector("#loginForm");
  if (loginForm) loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin(new FormData(loginForm));
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dashboardTab = button.dataset.tab;
      render();
    });
  });

  const logoutBtn = document.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", signOut);

  document.querySelectorAll(".work-chip").forEach((button) => {
    button.addEventListener("click", () => openWork(button.dataset.author, button.dataset.work));
  });

  const closePaywall = document.querySelector("#closePaywall");
  if (closePaywall) closePaywall.addEventListener("click", () => {
    state.paywallOpen = false;
    render();
  });

  const openPaymentModal = document.querySelector("#openPaymentModal");
  if (openPaymentModal) openPaymentModal.addEventListener("click", () => {
    state.selectedPlan = "5";
    state.paymentOpen = true;
    render();
  });

  const openPaymentFromProfile = document.querySelector("#openPaymentFromProfile");
  if (openPaymentFromProfile) openPaymentFromProfile.addEventListener("click", () => {
    state.selectedPlan = "5";
    state.paymentOpen = true;
    render();
  });

  const openPaymentFromHeader = document.querySelector("#openPaymentFromHeader");
  if (openPaymentFromHeader) openPaymentFromHeader.addEventListener("click", () => {
    state.selectedPlan = "5";
    state.paymentOpen = true;
    render();
  });

  document.querySelectorAll("[data-open-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPlan = button.dataset.openPlan || "5";
      if (!state.currentUser) {
        state.authMode = "signup";
        alert("გამოწერისთვის ჯერ შექმენი ანგარიში ან გაიარე ავტორიზაცია.");
        render();
        return;
      }
      state.paymentOpen = true;
      render();
    });
  });

  const closePaymentModal = document.querySelector("#closePaymentModal");
  if (closePaymentModal) closePaymentModal.addEventListener("click", () => {
    state.paymentOpen = false;
    render();
  });

  const paymentForm = document.querySelector("#paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", submitPayment);
    const screenshotInput = paymentForm.querySelector("#screenshotInput");
    if (screenshotInput) {
      screenshotInput.addEventListener("change", () => handleFileChange(screenshotInput, paymentForm));
    }
  }

  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => approvePayment(Number(button.dataset.approve), "premium"));
  });

  document.querySelectorAll("[data-deny]").forEach((button) => {
    button.addEventListener("click", () => approvePayment(Number(button.dataset.deny), "free"));
  });

  const openNewAuthorModal = document.querySelector("#openNewAuthorModal");
  if (openNewAuthorModal) openNewAuthorModal.addEventListener("click", () => openAdminEditor("author"));

  document.querySelectorAll("[data-add-author]").forEach((button) => {
    button.addEventListener("click", () => {
      const sectionId = button.dataset.addAuthor;
      state.selectedAuthorId = null;
      state.selectedWorkId = null;
      state.editAuthorId = null;
      state.adminModalMode = "author";
      state.adminModalOpen = true;
      render();
      const categoryField = document.querySelector('#authorForm select[name="categoryId"]');
      if (categoryField && sectionId) categoryField.value = sectionId;
    });
  });

  document.querySelectorAll("[data-edit-author]").forEach((button) => {
    button.addEventListener("click", () => openAdminEditor("author", button.dataset.editAuthor));
  });

  document.querySelectorAll("[data-add-work]").forEach((button) => {
    button.addEventListener("click", () => openAdminEditor("work", button.dataset.addWork));
  });

  document.querySelectorAll("[data-edit-work]").forEach((button) => {
    button.addEventListener("click", () => {
      const [authorId, workId] = button.dataset.editWork.split("|");
      openAdminEditor("work", authorId, workId);
    });
  });

  document.querySelectorAll("[data-preview-receipt]").forEach((button) => {
    button.addEventListener("click", () => previewReceipt(Number(button.dataset.previewReceipt)));
  });

  const closeAdminModal = document.querySelector("#closeAdminModal");
  if (closeAdminModal) closeAdminModal.addEventListener("click", () => {
    closeAdminModalState();
    render();
  });

  const authorForm = document.querySelector("#authorForm");
  if (authorForm) {
    authorForm.addEventListener("submit", saveAuthor);
    const portraitInput = authorForm.querySelector("#portraitInput");
    if (portraitInput) {
      portraitInput.addEventListener("change", () => handleFileChange(portraitInput, authorForm));
    }
  }

  const workForm = document.querySelector("#workForm");
  if (workForm) workForm.addEventListener("submit", saveWork);

  const closeReceiptPreviewBtn = document.querySelector("#closeReceiptPreview");
  if (closeReceiptPreviewBtn) closeReceiptPreviewBtn.addEventListener("click", () => {
    closeReceiptPreview();
    render();
  });
};

initState();
render();
subscribeToCurriculum();
subscribeToPendingPayments();
