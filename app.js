import { curriculumData, defaultUserStatus } from "./data.js";

const STORAGE_KEYS = {
  users: "users",
  currentUser: "currentUser",
  pendingPayments: "pendingPayments",
  library: "kalamiLibrary",
};

const ADMIN_EMAIL = "giorgijavakhishvili75@gmail.com";

const state = {
  route: "landing",
  authMode: "signup",
  dashboardTab: "library",
  selectedAuthorId: null,
  selectedWorkId: null,
  paywallOpen: false,
  paymentOpen: false,
  adminModalOpen: false,
  editAuthorId: null,
  users: [],
  currentUser: null,
  pendingPayments: [],
  library: [],
};

const app = document.querySelector("#app");

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

const hydrateLibrary = () => {
  const stored = getData(STORAGE_KEYS.library, null);
  if (!stored || !Array.isArray(stored) || !stored.length) {
    const fresh = clone(curriculumData);
    setData(STORAGE_KEYS.library, fresh);
    return fresh;
  }
  return stored;
};

const syncSessionUser = () => {
  if (!state.currentUser) return;
  const match = state.users.find((user) => user.email === state.currentUser.email);
  if (!match) {
    state.currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    return;
  }
  state.currentUser = attachRole(match);
  setData(STORAGE_KEYS.currentUser, state.currentUser);
};

const attachRole = (user) => ({
  ...user,
  role: user.email === ADMIN_EMAIL ? "admin" : user.role || "student",
});

const initState = () => {
  state.users = getData(STORAGE_KEYS.users, []);
  state.pendingPayments = getData(STORAGE_KEYS.pendingPayments, []);
  state.library = hydrateLibrary();
  const existingUser = getData(STORAGE_KEYS.currentUser, null);
  state.currentUser = existingUser ? attachRole(existingUser) : null;
  syncSessionUser();
  if (state.currentUser) {
    state.route = "dashboard";
  }
};

const persistUsers = () => {
  setData(STORAGE_KEYS.users, state.users);
  syncSessionUser();
};

const persistPayments = () => setData(STORAGE_KEYS.pendingPayments, state.pendingPayments);
const persistLibrary = () => setData(STORAGE_KEYS.library, state.library);

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

const isPremium = () => state.currentUser && (state.currentUser.status === "premium" || state.currentUser.role === "admin");
const isPending = () => state.currentUser && state.currentUser.status === "pending";
const isAdmin = () => state.currentUser && state.currentUser.role === "admin";

const updateCurrentUserStatus = (status) => {
  if (!state.currentUser) return;
  state.users = state.users.map((user) =>
    user.email === state.currentUser.email ? { ...user, status } : user
  );
  persistUsers();
};

const setRoute = (route) => {
  state.route = route;
  render();
};

const signOut = () => {
  state.currentUser = null;
  state.route = "landing";
  state.dashboardTab = "library";
  state.selectedAuthorId = null;
  state.selectedWorkId = null;
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  render();
};

const handleSignup = (formData) => {
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
    status: email === ADMIN_EMAIL ? "premium" : defaultUserStatus,
  });

  state.users.push(newUser);
  persistUsers();
  state.currentUser = newUser;
  setData(STORAGE_KEYS.currentUser, newUser);
  state.route = "dashboard";
  render();
};

const handleLogin = (formData) => {
  const email = formData.get("email").trim().toLowerCase();
  const password = formData.get("password").trim();
  const user = state.users.find((item) => item.email === email && item.password === password);

  if (!user) {
    alert("ელ-ფოსტა ან პაროლი არასწორია.");
    return;
  }

  const sessionUser = attachRole(user);
  state.currentUser = sessionUser;
  setData(STORAGE_KEYS.currentUser, sessionUser);
  state.route = "dashboard";
  render();
};

const openWork = (authorId, workId) => {
  state.selectedAuthorId = authorId;
  state.selectedWorkId = workId;
  state.dashboardTab = "library";
  state.paywallOpen = !isPremium();
  render();
};

const submitPayment = (event) => {
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
    email: state.currentUser.email,
    senderName,
    screenshot,
    status: "pending",
  };

  state.pendingPayments.push(packet);
  persistPayments();
  updateCurrentUserStatus("pending");
  alert("ქვითარი წარმატებით გაიგზავნა.");
  state.paymentOpen = false;
  state.paywallOpen = true;
  render();
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

const approvePayment = (paymentId, nextStatus) => {
  const request = state.pendingPayments.find((item) => item.id === paymentId);
  if (!request) return;

  state.users = state.users.map((user) => {
    if (user.email !== request.email) return user;
    return { ...user, status: nextStatus };
  });

  state.pendingPayments = state.pendingPayments.filter((item) => item.id !== paymentId);
  persistPayments();
  persistUsers();

  alert(
    nextStatus === "premium"
      ? "მომხმარებელი წარმატებით გააქტიურდა."
      : "ქვითარი უარყოფილია და სტატუსი განულდა."
  );
  render();
};

const saveAuthor = (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const authorId = form.authorId.value.trim();
  const categoryId = form.categoryId.value;
  const name = form.name.value.trim();
  const bio = form.bio.value.trim();
  const portrait = form.dataset.base64 || form.portraitUrl.value.trim();
  const workTitle = form.workTitle.value.trim();
  const workSummary = form.workSummary.value.trim();
  const workCharacters = form.workCharacters.value.trim();
  const workStructure = form.workStructure.value.trim();
  const workContext = form.workContext.value.trim();

  if (!name || !bio) {
    alert("გთხოვთ შეავსოთ ავტორის სახელი და ბიოგრაფია.");
    return;
  }

  if (state.editAuthorId) {
    state.library = state.library.map((section) => ({
      ...section,
      authors: section.authors.map((author) => {
        if (author.id !== state.editAuthorId) return author;
        const updatedWorks = [...author.works];
        if (workTitle) {
          updatedWorks.push({
            id: `${Date.now()}`,
            title: workTitle,
            summary: workSummary,
            characters: workCharacters,
            structure: workStructure,
            context: workContext,
          });
        }
        return { ...author, name, bio, portrait, works: updatedWorks };
      }),
    }));
  } else {
    const targetSection = state.library.find((section) => section.id === categoryId);
    if (!targetSection) return;
    targetSection.authors.push({
      id: authorId || `author-${Date.now()}`,
      name,
      bio,
      portrait,
      works: workTitle
        ? [
            {
              id: `work-${Date.now()}`,
              title: workTitle,
              summary: workSummary,
              characters: workCharacters,
              structure: workStructure,
              context: workContext,
            },
          ]
        : [],
    });
  }

  persistLibrary();
  state.adminModalOpen = false;
  state.editAuthorId = null;
  alert("ცვლილებები შენახულია.");
  render();
};

const openAdminEditor = (authorId = null) => {
  state.editAuthorId = authorId;
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
        <h1>წაიკითხე ნაკლები ქაოსი, ისწავლე მეტი სიზუსტით.</h1>
        <p>
          კალამი აერთიანებს ქართულ ლიტერატურას ერთ მოწესრიგებულ სივრცეში: სიუჟეტური შეჯამებები,
          პერსონაჟთა ანალიზი, სტრუქტურული რუკები და ისტორიული კონტექსტი მხოლოდ 5 ლარად თვეში.
        </p>
        <div class="hero-stats">
          <article><strong>40+</strong><span>ავტორი და ტექსტი</span></article>
          <article><strong>100%</strong><span>LocalStorage persistence</span></article>
          <article><strong>5 GEL</strong><span>სრული წვდომა / თვე</span></article>
        </div>
      </div>
      <div class="pricing-card spotlight">
        <div class="plan-badge">Premium Access</div>
        <h2>სრული კატალოგი</h2>
        <p>ყველა ავტორი, ყველა თავი, სწრაფი დაბრუნება შენს სამუშაო სივრცეში.</p>
        <div class="price-line">5 ლარი<span>/თვე</span></div>
        <ul class="plan-list">
          <li>ქართული ლიტერატურის 2026 პროგრამა</li>
          <li>ავტორები, ნაწარმოებები, კონტექსტი</li>
          <li>ხელით აქტივაცია Bank of Georgia გადარიცხვით</li>
        </ul>
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
      <section class="pricing-grid">
        <article class="pricing-card">
          <h3>Free</h3>
          <p>დაათვალიერე ბიბლიოთეკა, ავტორები და თემატური კატეგორიები.</p>
          <div class="mini-price">0 ლარი</div>
        </article>
        <article class="pricing-card premium">
          <div class="plan-badge subtle">ყველაზე მოთხოვნადი</div>
          <h3>Premium</h3>
          <p>გახსენი დეტალური შინაარსი და ატვირთე ქვითარი ხელით აქტივაციისთვის.</p>
          <div class="mini-price">5 ლარი / თვე</div>
          <small>საქართველოს ბანკი: GE928G0000000612371503</small>
        </article>
      </section>
    </div>
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
            <span class="section-count">${section.authors.length} ავტორი</span>
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
                      <p>${author.bio}</p>
                    </div>
                  </div>
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
  const author = getSelectedAuthor();
  const work = getSelectedWork();

  if (!author || !work) {
    return `
      <aside class="detail-panel empty-state">
        <h3>შეარჩიე ნაწარმოები</h3>
        <p>ბიბლიოთეკიდან დააჭირე ნებისმიერ ტექსტს და აქ გაიხსნება მისი ანალიტიკური ბარათი.</p>
      </aside>
    `;
  }

  return `
    <aside class="detail-panel ${!isPremium() ? "blurred" : ""}">
      <div class="detail-header">
        <div>
          <span class="section-tag">${author.name}</span>
          <h3>${work.title}</h3>
        </div>
        ${
          !isPremium()
            ? `<button class="accent-btn" id="openPaymentFromHeader">💳 ქვითრის ატვირთვა</button>`
            : ""
        }
      </div>
      <div class="detail-block">
        <h4>მოკლე შინაარსი</h4>
        <p>${work.summary}</p>
      </div>
      <div class="detail-block">
        <h4>პერსონაჟები</h4>
        <p>${work.characters}</p>
      </div>
      <div class="detail-block">
        <h4>სტრუქტურა</h4>
        <p>${work.structure}</p>
      </div>
      <div class="detail-block">
        <h4>ისტორიული კონტექსტი</h4>
        <p>${work.context}</p>
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
  <section class="dashboard-layout">
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
      ${renderLibraryGrid()}
    </div>
    ${renderWorkPanel()}
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
    <div class="library-header">
      <div>
        <span class="eyebrow">ადმინისტრაცია</span>
        <h2>გადახდების მართვა</h2>
      </div>
      <div class="status-pill pending">${state.pendingPayments.length} მოთხოვნა</div>
    </div>
    <div class="payments-grid">
      ${
        state.pendingPayments.length
          ? state.pendingPayments
              .map(
                (payment) => `
                  <article class="payment-card">
                    <img src="${payment.screenshot}" alt="ქვითარი" class="payment-thumb" />
                    <div class="payment-meta">
                      <h3>${payment.senderName}</h3>
                      <p>${payment.email}</p>
                    </div>
                    <div class="payment-actions">
                      <button class="primary-btn" data-approve="${payment.id}">დამტკიცება</button>
                      <button class="secondary-btn" data-deny="${payment.id}">უარყოფა</button>
                    </div>
                  </article>
                `
              )
              .join("")
          : `<div class="empty-payments">ამ ეტაპზე გადახდის მოთხოვნები არ არის.</div>`
      }
    </div>
  </section>
`;

const paymentModalMarkup = () => {
  if (!state.paymentOpen || !state.currentUser) return "";
  return `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-head">
          <div>
            <span class="section-tag premium-lock">აქტივაცია</span>
            <h3>ქვითრის ატვირთვა</h3>
          </div>
          <button class="icon-button" id="closePaymentModal">✕</button>
        </div>
        <p>პლატფორმის სრული წვდომისთვის გთხოვთ გადარიცხოთ 5 ლარი მითითებულ ანგარიშზე.<br />საქართველოს ბანკი (BOG): GE928G0000000612371503</p>
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

  return `
    <div class="modal-backdrop">
      <div class="modal-card large">
        <div class="modal-head">
          <div>
            <span class="section-tag">${state.editAuthorId ? "რედაქტირება" : "ახალი ჩანაწერი"}</span>
            <h3>${state.editAuthorId ? "ავტორის განახლება" : "ახალი ავტორის დამატება"}</h3>
          </div>
          <button class="icon-button" id="closeAdminModal">✕</button>
        </div>
        <form id="authorForm" class="stack-form two-column">
          <input type="hidden" name="authorId" value="${selected?.author.id || ""}" />
          <label>
            <span>კატეგორია</span>
            <select name="categoryId" ${state.editAuthorId ? "disabled" : ""}>
              ${state.library
                .map(
                  (section) => `
                    <option value="${section.id}" ${selected?.section.id === section.id ? "selected" : ""}>${section.category}</option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label>
            <span>ავტორის სახელი</span>
            <input name="name" type="text" value="${selected?.author.name || ""}" required />
          </label>
          <label class="full-span">
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
          <label>
            <span>ახალი ნაწარმოების სათაური</span>
            <input name="workTitle" type="text" />
          </label>
          <label>
            <span>პერსონაჟები</span>
            <input name="workCharacters" type="text" />
          </label>
          <label class="full-span">
            <span>მოკლე შინაარსი</span>
            <textarea name="workSummary" rows="3"></textarea>
          </label>
          <label>
            <span>სტრუქტურა</span>
            <textarea name="workStructure" rows="3"></textarea>
          </label>
          <label>
            <span>ისტორიული კონტექსტი</span>
            <textarea name="workContext" rows="3"></textarea>
          </label>
          <button type="submit" class="primary-btn full-span">შენახვა</button>
        </form>
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
  </div>
`;

const render = () => {
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
    state.paymentOpen = true;
    render();
  });

  const openPaymentFromProfile = document.querySelector("#openPaymentFromProfile");
  if (openPaymentFromProfile) openPaymentFromProfile.addEventListener("click", () => {
    state.paymentOpen = true;
    render();
  });

  const openPaymentFromHeader = document.querySelector("#openPaymentFromHeader");
  if (openPaymentFromHeader) openPaymentFromHeader.addEventListener("click", () => {
    state.paymentOpen = true;
    render();
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
  if (openNewAuthorModal) openNewAuthorModal.addEventListener("click", () => openAdminEditor());

  document.querySelectorAll("[data-edit-author]").forEach((button) => {
    button.addEventListener("click", () => openAdminEditor(button.dataset.editAuthor));
  });

  const closeAdminModal = document.querySelector("#closeAdminModal");
  if (closeAdminModal) closeAdminModal.addEventListener("click", () => {
    state.adminModalOpen = false;
    state.editAuthorId = null;
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
};

initState();
render();
