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
  currentView: "authors-main",
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
  title: work.title || "",
  summary: work.summary || "",
  characters: work.characters || "",
  structure: work.structure || "",
  questions: work.questions || work.context || "",
  context: work.context || work.questions || "",
});

const normalizeWorkMap = (works) => {
  if (!works) return {};
  if (Array.isArray(works)) {
    return Object.fromEntries(
      works.map((work) => [
        work.id || slugify(`${work.title || "work"}-${Date.now()}`),
        {
          title: work.title || "",
          chapters: work.summary
            ? {
                summary: {
                  title: "შინაარსი",
                  content: work.summary,
                },
              }
            : {},
          characters: typeof work.characters === "string"
            ? {
                default: {
                  name: "პერსონაჟები",
                  description: work.characters,
                },
              }
            : work.characters || {},
          structure: work.structure || "",
          questions: work.questions || work.context || "",
        },
      ])
    );
  }

  return Object.fromEntries(
    Object.entries(works).map(([workId, work]) => [
      workId,
      {
        title: work.title || "",
        chapters: work.chapters || {},
        characters: work.characters || {},
        structure: work.structure || "",
        questions: work.questions || "",
      },
    ])
  );
};

const normalizeAuthorsMap = (payload) => {
  if (!payload) return {};

  if (payload.authors && !Array.isArray(payload.authors)) {
    return Object.fromEntries(
      Object.entries(payload.authors).map(([authorId, author]) => [
        authorId,
        {
          name: author.name || "",
          bio: author.bio || "",
          image: author.image || author.portrait || "",
          era: author.era || "",
          works: normalizeWorkMap(author.works),
        },
      ])
    );
  }

  const looksLikeDirectAuthorsMap =
    !Array.isArray(payload) &&
    Object.values(payload).some(
      (item) =>
        item &&
        typeof item === "object" &&
        ("name" in item || "bio" in item || "works" in item || "image" in item || "portrait" in item)
    );

  if (looksLikeDirectAuthorsMap) {
    return Object.fromEntries(
      Object.entries(payload).map(([authorId, author]) => [
        authorId,
        {
          name: author.name || "",
          bio: author.bio || "",
          image: author.image || author.portrait || "",
          era: author.era || "",
          works: normalizeWorkMap(author.works),
        },
      ])
    );
  }

  if (Array.isArray(payload)) {
    const authors = payload.flatMap((section) =>
      (section.authors || []).map((author) => [
        author.id || slugify(author.name),
        {
          name: author.name || "",
          bio: author.bio || "",
          image: author.image || author.portrait || "",
          era: author.era || section.category || "",
          works: normalizeWorkMap(author.works),
        },
      ])
    );
    return Object.fromEntries(authors);
  }

  return {};
};

const getDefaultAuthorsMap = () => normalizeAuthorsMap(clone(curriculumData));

const hasRenderableAuthors = (authorsMap) =>
  !!authorsMap &&
  Object.keys(authorsMap).length > 0 &&
  Object.values(authorsMap).some(
    (author) =>
      author &&
      typeof author === "object" &&
      (author.name || author.bio || author.image || author.portrait || author.works)
  );

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
  state.library = getDefaultAuthorsMap();
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
  const author = state.library?.[authorId];
  return author ? { authorId, author } : null;
};

const getSelectedAuthor = () => {
  if (!state.selectedAuthorId) return null;
  return findAuthorById(state.selectedAuthorId)?.author || null;
};

const getSelectedWork = () => {
  const author = getSelectedAuthor();
  if (!author || !state.selectedWorkId) return null;
  const work = author.works?.[state.selectedWorkId];
  return work ? { id: state.selectedWorkId, ...work } : null;
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

const getAuthorRef = (authorId) => (curriculumRef && authorId ? curriculumRef.child(`authors/${authorId}`) : null);
const getWorkRef = (authorId, workId) =>
  curriculumRef && authorId && workId ? curriculumRef.child(`authors/${authorId}/works/${workId}`) : null;
const getChaptersRef = (authorId, workId) =>
  curriculumRef && authorId && workId ? curriculumRef.child(`authors/${authorId}/works/${workId}/chapters`) : null;
const getCharactersRef = (authorId, workId) =>
  curriculumRef && authorId && workId ? curriculumRef.child(`authors/${authorId}/works/${workId}/characters`) : null;

const openAuthorsDirectory = () => {
  state.currentView = "authors-main";
  state.selectedAuthorId = null;
  state.selectedWorkId = null;
  render();
};

const openAuthorDetail = (authorId) => {
  if (!authorId) return;
  state.currentView = "author-detail";
  state.selectedAuthorId = authorId;
  state.selectedWorkId = null;
  render();
};

const openWorkEditor = (authorId, workId) => {
  if (!authorId || !workId) return;
  state.currentView = "work-editor";
  state.selectedAuthorId = authorId;
  state.selectedWorkId = workId;
  render();
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
        state.library = getDefaultAuthorsMap();
        state.curriculumError = "";
      } else {
        const normalizedAuthors = normalizeAuthorsMap(remoteValue);
        if (hasRenderableAuthors(normalizedAuthors)) {
          state.library = normalizedAuthors;
          state.curriculumError = "";
        } else {
          state.library = getDefaultAuthorsMap();
          state.curriculumError = "Firebase მონაცემების სტრუქტურა არასწორია. ჩაიტვირთა სარეზერვო ბიბლიოთეკა.";
          console.warn("Unexpected Firebase curriculum payload:", remoteValue);
        }
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

const addNewChapter = async (event) => {
  event.preventDefault();
  const authorId = state.selectedAuthorId;
  const workId = state.selectedWorkId;
  const title = event.currentTarget.chapterTitle.value.trim();
  const content = event.currentTarget.chapterContent.value.trim();
  if (!authorId || !workId || !title || !content) return;

  const chapterId = `${slugify(title) || "chapter"}-${Date.now()}`;
  try {
    await getChaptersRef(authorId, workId).child(chapterId).set({ title, content });
    event.currentTarget.reset();
    alert("ახალი თავი დამატებულია.");
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "თავის დამატება ვერ მოხერხდა."));
  }
};

const addNewCharacter = async (event) => {
  event.preventDefault();
  const authorId = state.selectedAuthorId;
  const workId = state.selectedWorkId;
  const name = event.currentTarget.characterName.value.trim();
  const description = event.currentTarget.characterDescription.value.trim();
  if (!authorId || !workId || !name || !description) return;

  const characterId = `${slugify(name) || "character"}-${Date.now()}`;
  try {
    await getCharactersRef(authorId, workId).child(characterId).set({ name, description });
    event.currentTarget.reset();
    alert("პერსონაჟი დამატებულია.");
  } catch (error) {
    alert(getFirebaseErrorMessage(error, "პერსონაჟის დამატება ვერ მოხერხდა."));
  }
};

const saveAuthor = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  const era = form.era.value.trim();
  const bio = form.bio.value.trim();
  const image = form.dataset.base64 || form.portraitUrl.value.trim();
  const authorId = state.editAuthorId || `${slugify(name) || "author"}-${Date.now()}`;

  if (!name || !era || !bio) {
    alert("გთხოვთ შეავსოთ ავტორის სახელი, ეპოქა და ბიოგრაფია.");
    return;
  }

  try {
    const existingWorks = state.library?.[authorId]?.works || {};
    await getAuthorRef(authorId).set({
      name,
      bio,
      image,
      era,
      works: existingWorks,
    });
    closeAdminModalState();
    openAuthorDetail(authorId);
    alert("ავტორი წარმატებით შენახულია.");
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
  if (!title) {
    alert("გთხოვთ შეავსოთ ნაწარმოების სათაური.");
    return;
  }

  const workId = state.editWorkId || `${slugify(title) || "work"}-${Date.now()}`;
  try {
    const existingWork = state.library?.[authorId]?.works?.[workId] || {};
    await getWorkRef(authorId, workId).set({
      title,
      chapters: existingWork.chapters || {},
      characters: existingWork.characters || {},
      structure: existingWork.structure || "",
      questions: existingWork.questions || "",
    });
    closeAdminModalState();
    openWorkEditor(authorId, workId);
    alert("ნაწარმოები შენახულია.");
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

const getAuthorsArray = () =>
  Object.entries(state.library || {}).map(([id, author]) => ({
    ...author,
    id,
    works: author.works || {},
  }));

const renderAuthorsMainDirectory = () => {
  const authors = getAuthorsArray();
  return `
    <section class="library-shell cms-shell">
      <div class="library-header">
        <div>
          <span class="eyebrow">ადმინ პანელი</span>
          <h2>ავტორების დირექტორია</h2>
        </div>
        <button class="add-btn" id="openNewAuthorModal" aria-label="ახალი ავტორი">+</button>
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
      <div class="author-grid cms-author-grid">
        ${
          authors.length
            ? authors
                .map(
                  (author) => `
                    <article class="author-card cms-clickable-card" data-open-author="${author.id}">
                      <div class="author-top">
                        <div class="avatar-wrap">
                          ${
                            author.image
                              ? `<img src="${author.image}" alt="${author.name || "ავტორი"}" class="avatar-img" />`
                              : `<div class="avatar-fallback">${author.name?.charAt(0) || "ა"}</div>`
                          }
                        </div>
                        <div>
                          <h4>${author.name || "ავტორი"}</h4>
                          <p>${author.era || "ავტორი"}</p>
                        </div>
                      </div>
                      <p>${author.bio || "ბიოგრაფია ჯერ არ არის დამატებული."}</p>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-payments">ავტორები ჯერ არ არის დამატებული.</div>`
        }
      </div>
    </section>
  `;
};

const renderAuthorDetailPage = () => {
  const author = getSelectedAuthor();
  if (state.curriculumLoading) {
    return `<section class="library-shell"><div class="sync-banner">ინფორმაცია იტვირთება...</div></section>`;
  }
  if (!author) {
    return `
      <section class="library-shell">
        <div class="cms-header-row">
          <button class="secondary-btn" data-back-authors>უკან</button>
        </div>
        <div class="empty-payments">ინფორმაცია იტვირთება...</div>
      </section>
    `;
  }

  const works = Object.entries(author.works || {}).map(([id, work]) => ({ id, ...work }));
  return `
    <section class="library-shell cms-shell">
      <div class="cms-header-row">
        <button class="secondary-btn" data-back-authors>უკან</button>
        <button class="accent-btn" data-add-work="${state.selectedAuthorId}">ახალი ნაწარმოების დამატება</button>
      </div>
      <article class="cms-author-profile">
        <div class="avatar-wrap large">
          ${
            author.image
              ? `<img src="${author.image}" alt="${author.name}" class="avatar-img" />`
              : `<div class="avatar-fallback">${author.name?.charAt(0) || "ა"}</div>`
          }
        </div>
        <div>
          <h2>${author.name}</h2>
          <p>${author.bio || "ბიოგრაფია ჯერ არ არის დამატებული."}</p>
        </div>
      </article>
      <section class="cms-works-section">
        <h3>ნაწარმოებები</h3>
        <div class="cms-work-grid">
          ${
            works.length
              ? works
                  .map(
                    (work) => `
                      <button class="work-chip" data-open-work="${state.selectedAuthorId}|${work.id}">
                        ${work.title || "უსათაურო ნაწარმოები"}
                      </button>
                    `
                  )
                  .join("")
              : `<div class="empty-payments">ამ ავტორს ჯერ ნაწარმოებები არ აქვს.</div>`
          }
        </div>
      </section>
    </section>
  `;
};

const renderWorkEditorPage = () => {
  const author = getSelectedAuthor();
  const work = getSelectedWork();
  if (state.curriculumLoading) {
    return `<section class="library-shell"><div class="sync-banner">ინფორმაცია იტვირთება...</div></section>`;
  }
  if (!author || !work) {
    return `
      <section class="library-shell">
        <div class="cms-header-row">
          <button class="secondary-btn" data-back-author>უკან</button>
        </div>
        <div class="empty-payments">ინფორმაცია იტვირთება...</div>
      </section>
    `;
  }

  const chapters = Object.entries(work.chapters || {}).map(([id, chapter]) => ({ id, ...chapter }));
  const characters = Object.entries(work.characters || {}).map(([id, character]) => ({ id, ...character }));

  return `
    <section class="library-shell cms-shell">
      <div class="cms-header-row">
        <button class="secondary-btn" data-back-author>უკან</button>
      </div>
      <div class="cms-work-header">
        <span class="section-tag">${author.name}</span>
        <h2>${work.title}</h2>
      </div>
      <div class="cms-editor-grid">
        <section class="cms-editor-section">
          <h3>შინაარსი და თავები</h3>
          <div class="cms-list-block">
            ${
              chapters.length
                ? chapters
                    .map(
                      (chapter) => `
                        <article class="cms-item-card">
                          <h4>${chapter.title}</h4>
                          <p>${chapter.content}</p>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="empty-payments">თავები ჯერ არ არის დამატებული.</div>`
            }
          </div>
          <form id="chapterForm" class="stack-form">
            <label>
              <span>თავის სათაური</span>
              <input name="chapterTitle" type="text" required />
            </label>
            <label>
              <span>ტექსტი</span>
              <textarea name="chapterContent" rows="6" required></textarea>
            </label>
            <button type="submit" class="primary-btn">ახალი თავის დამატება</button>
          </form>
        </section>
        <section class="cms-editor-section">
          <h3>პერსონაჟთა დახასიათება</h3>
          <div class="cms-list-block">
            ${
              characters.length
                ? characters
                    .map(
                      (character) => `
                        <article class="cms-item-card">
                          <h4>${character.name}</h4>
                          <p>${character.description}</p>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="empty-payments">პერსონაჟები ჯერ არ არის დამატებული.</div>`
            }
          </div>
          <form id="characterForm" class="stack-form">
            <label>
              <span>პერსონაჟის სახელი</span>
              <input name="characterName" type="text" required />
            </label>
            <label>
              <span>დახასიათება</span>
              <textarea name="characterDescription" rows="6" required></textarea>
            </label>
            <button type="submit" class="primary-btn">პერსონაჟის დამატება</button>
          </form>
        </section>
      </div>
    </section>
  `;
};

const renderStudentLibrary = () => {
  const authors = getAuthorsArray();
  return `
    <section class="library-shell">
      <div class="library-header">
        <div>
          <span class="eyebrow">ბიბლიოთეკა</span>
          <h2>ავტორები და ნაწარმოებები</h2>
        </div>
      </div>
      <div class="author-grid">
        ${
          authors.length
            ? authors
                .map(
                  (author) => `
                    <article class="author-card">
                      <div class="author-top">
                        <div class="avatar-wrap">
                          ${
                            author.image
                              ? `<img src="${author.image}" alt="${author.name || "ავტორი"}" class="avatar-img" />`
                              : `<div class="avatar-fallback">${author.name?.charAt(0) || "ა"}</div>`
                          }
                        </div>
                        <div>
                          <h4>${author.name || "ავტორი"}</h4>
                          <p>${author.era || "ავტორი"}</p>
                        </div>
                      </div>
                      <p>${author.bio || "ბიოგრაფია ჯერ არ არის დამატებული."}</p>
                      <div class="work-list">
                        ${Object.entries(author.works || {})
                          .map(
                            ([workId, work]) => `
                              <button class="work-chip" data-open-student-work="${author.id}|${workId}">
                                ${work.title || "უსათაურო ნაწარმოები"}
                              </button>
                            `
                          )
                          .join("")}
                      </div>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-payments">ბიბლიოთეკა ცარიელია.</div>`
        }
      </div>
    </section>
  `;
};

const libraryMarkup = () => {
  if (!isAdmin()) return renderStudentLibrary();
  if (state.currentView === "author-detail") return renderAuthorDetailPage();
  if (state.currentView === "work-editor") return renderWorkEditorPage();
  return renderAuthorsMainDirectory();
};

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
      ? selected?.author.works?.[state.editWorkId] || null
      : null;

  if (state.adminModalMode === "work") {
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
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
            <button type="submit" class="primary-btn">შენახვა</button>
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
          <label>
            <span>ავტორის სახელი და გვარი</span>
            <input name="name" type="text" value="${selected?.author.name || ""}" required />
          </label>
          <label>
            <span>ეპოქა</span>
            <input name="era" type="text" value="${selected?.author.era || ""}" required />
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

  document.querySelectorAll("[data-open-author]").forEach((button) => {
    button.addEventListener("click", () => {
      const authorId = button.dataset.openAuthor;
      if (!authorId) return;
      openAuthorDetail(authorId);
    });
  });

  document.querySelectorAll("[data-open-work]").forEach((button) => {
    button.addEventListener("click", () => {
      const [authorId, workId] = button.dataset.openWork.split("|");
      if (!authorId || !workId) return;
      openWorkEditor(authorId, workId);
    });
  });

  document.querySelectorAll("[data-open-student-work]").forEach((button) => {
    button.addEventListener("click", () => {
      const [authorId, workId] = button.dataset.openStudentWork.split("|");
      openWork(authorId, workId);
    });
  });

  document.querySelectorAll("[data-back-authors]").forEach((button) => {
    button.addEventListener("click", openAuthorsDirectory);
  });

  document.querySelectorAll("[data-back-author]").forEach((button) => {
    button.addEventListener("click", () => openAuthorDetail(state.selectedAuthorId));
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

  document.querySelectorAll("[data-edit-author]").forEach((button) => {
    button.addEventListener("click", () => openAdminEditor("author", button.dataset.editAuthor));
  });

  document.querySelectorAll("[data-add-work]").forEach((button) => {
    button.addEventListener("click", () => openAdminEditor("work", button.dataset.addWork));
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

  const chapterForm = document.querySelector("#chapterForm");
  if (chapterForm) chapterForm.addEventListener("submit", addNewChapter);

  const characterForm = document.querySelector("#characterForm");
  if (characterForm) characterForm.addEventListener("submit", addNewCharacter);

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
