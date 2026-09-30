import $ from "jquery";
import * as L from "leaflet";
import { firebaseConfigured, getIdToken, logout as firebaseLogout, observeAuth, register as firebaseRegister, signIn as firebaseSignIn, signInWithSocialProvider, type SocialProvider } from "./auth";
import { startLogin } from "./const";
import type { User } from "firebase/auth";

type ApiResult<T = unknown> = { success: boolean; message?: string; data?: T };
type GeoPoint = { latitude: number; longitude: number; accuracy: number };
type SessionUser = { name?: string | null; email?: string | null; openId?: string };
type AppState = { firebaseUser: User | null; sessionUser: SessionUser | null; liveLocation: GeoPoint | null; locationMessage: string; routeRequest: any | null };
const state: AppState = { firebaseUser: null, sessionUser: null, liveLocation: null, locationMessage: "", routeRequest: null };
const isAuthenticated = () => Boolean(state.firebaseUser || state.sessionUser);
const maps: Record<string, L.Map> = {};
const mapResizeTimers: Record<string, number | undefined> = {};
const categories = ["Form Assistance", "Tutoring", "Errands", "Parcel Pickup", "Technical Help", "Shopping Assistance", "Elderly Assistance", "Other"];
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char] ?? char);
const money = (value: unknown) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
const dateLabel = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Flexible date";

async function api<T = unknown>(url: string, options: JQuery.AjaxSettings = {}) {
  const token = await getIdToken();
  const headers = { ...(options.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return $.ajax({ url, dataType: "json", xhrFields: { withCredentials: true }, ...options, headers }) as unknown as Promise<ApiResult<T>>;
}

function notice(message: string, kind: "info" | "danger" | "success" = "info") {
  return `<div class="notice notice-${kind} mb-3" role="alert">${escapeHtml(message)}</div>`;
}

function apiErrorMessage(error: unknown, fallback: string) {
  const response = error as { responseJSON?: ApiResult; message?: string };
  return response.responseJSON?.message ?? response.message ?? (error instanceof Error ? error.message : fallback);
}

function authActionNotice(message: string) {
  sessionStorage.setItem("neighbourhelp:returnAfterAuth", window.location.hash);
  return `${notice(message, "info")}<a href="#/login" data-route="login" class="btn btn-sm btn-nh-primary">Sign in to continue</a>`;
}

function continueAfterAuth() {
  const destination = sessionStorage.getItem("neighbourhelp:returnAfterAuth") || "#/dashboard";
  sessionStorage.removeItem("neighbourhelp:returnAfterAuth");
  window.location.hash = destination;
}

function navbar() {
  const loggedIn = isAuthenticated();
  return `<nav class="navbar navbar-expand-lg navbar-shell fixed-top">
    <div class="container py-2">
      <a class="brand-mark" href="#/" data-route="home" aria-label="NeighbourHelp home"><span class="brand-dot">N</span><span><span class="d-block">NeighbourHelp</span><span class="brand-sub">Help. Earn. Belong.</span></span></a>
      <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-label="Open navigation"><span class="navbar-toggler-icon"></span></button>
      <div class="collapse navbar-collapse" id="mainNav">
        <div class="navbar-nav ms-auto align-items-lg-center gap-lg-2">
          <a class="nav-link" href="#/requests" data-route="requests">Find help</a>
          <a class="nav-link" href="#/helpers" data-route="helpers">Helpers</a>
          ${loggedIn ? `<a class="nav-link" href="#/dashboard" data-route="dashboard">Dashboard</a><a class="nav-link" href="#/create-request" data-route="create-request">Post a request</a><button class="btn btn-nh-outline ms-lg-2" data-action="logout">Sign out</button>` : `<a class="nav-link" href="#/login" data-route="login">Log in</a><a class="btn btn-nh-primary ms-lg-2" href="#/register" data-route="register">Join the neighbourhood</a>`}
        </div>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `<footer class="footer"><div class="container d-flex flex-column flex-md-row justify-content-between gap-2"><span><strong>NeighbourHelp</strong> — small acts, stronger neighbourhoods.</span><span>Built for local trust. Location shown approximately. <a href="#/admin" data-route="admin" class="ms-2">Admin console</a></span></div></footer>`;
}

function shell(content: string, className = "") {
  return `${navbar()}<main class="app-view ${className}">${content}</main>${footer()}`;
}

function home() {
  return shell(`<section class="hero"><div class="container position-relative"><div class="row align-items-center g-5"><div class="col-lg-7"><div class="hero-kicker mb-3">A better way to ask for a hand</div><h1>Good neighbours make <em>everyday</em> easier.</h1><p class="hero-copy mt-4">NeighbourHelp connects people who need help with trusted people nearby — for errands, tutoring, tech support, and the moments that matter.</p><div class="d-flex flex-wrap gap-2 mt-4"><a class="btn btn-nh-primary" href="#/register" data-route="register">Get started <span class="ms-2">→</span></a><a class="btn btn-nh-outline" href="#/requests" data-route="requests">Browse open requests</a></div><div class="d-flex align-items-center gap-3 mt-5"><div class="avatar-stack"><span>AS</span><span>RK</span><span>JM</span><span>+</span></div><small class="text-secondary">A community built on reliable help<br><strong class="text-dark">with trust visible at every step.</strong></small></div></div><div class="col-lg-5"><div class="hero-card"><div class="hero-card-inner"><div class="d-flex justify-content-between align-items-start"><span class="badge rounded-pill bg-light text-dark">Near you · open now</span><span class="fs-4">↗</span></div><div class="mt-5"><div class="small opacity-75">NEIGHBOURHOOD REQUEST</div><h3 class="mt-2 mb-2">Help setting up a new phone</h3><p class="opacity-75 mb-4">Andheri East · Today, 5:30 PM</p><div class="d-flex justify-content-between align-items-center"><strong>${money(350)}–${money(500)}</strong><span class="badge rounded-pill" style="background:rgba(255,255,255,.16)">Open</span></div></div></div></div></div></div></div></section><section class="section-space pt-0"><div class="container"><div class="mini-map-panel"><div class="row align-items-center g-4"><div class="col-lg-4"><div class="section-kicker mb-2">Your neighbourhood, at a glance</div><h2 class="section-heading h1 mb-3">See the help happening nearby.</h2><p class="section-copy mb-3">Explore the map, move around your area, or share your live location when you are ready to discover nearby help.</p><button class="btn btn-nh-soft" type="button" data-action="use-live-location" data-map-target="home-mini-map" data-status-target="home-location-status">⌖ Use my live location</button><div id="home-location-status" class="small text-secondary mt-2">Location not shared</div></div><div class="col-lg-8"><div id="home-mini-map" class="map-canvas mini-map-canvas"></div><p class="small text-secondary mt-2 mb-0">OpenStreetMap · Approximate neighbourhood view · Location sharing is optional</p></div></div></div></div></section><section class="flow-strip"><div class="container d-flex align-items-center justify-content-between gap-3"><div class="flow-item"><span class="flow-number">01</span>Need help</div><span class="flow-arrow">→</span><div class="flow-item"><span class="flow-number">02</span>Post a request</div><span class="flow-arrow">→</span><div class="flow-item"><span class="flow-number">03</span>Meet a nearby helper</div><span class="flow-arrow">→</span><div class="flow-item"><span class="flow-number">04</span>Complete & rate</div></div></section><section class="section-space"><div class="container"><div class="row g-5 align-items-end"><div class="col-lg-6"><div class="section-kicker mb-3">Why NeighbourHelp</div><h2 class="section-heading">Local support, with a little more humanity.</h2></div><div class="col-lg-5 ms-auto"><p class="section-copy">From a quick parcel pickup to patient tutoring, the right support is usually closer than you think. We make the whole journey simple, visible, and built around trust.</p></div></div><div class="row g-3 mt-4"><div class="col-md-4"><div class="feature-card"><div class="feature-icon">⌖</div><h4>Find nearby help</h4><p class="section-copy mb-0">Explore requests and helpers around your neighbourhood with map-based discovery.</p></div></div><div class="col-md-4"><div class="feature-card"><div class="feature-icon">✦</div><h4>Trust in the open</h4><p class="section-copy mb-0">Ratings, reviews, completed tasks, and project verification help you decide with confidence.</p></div></div><div class="col-md-4"><div class="feature-card"><div class="feature-icon">♡</div><h4>Earn belonging</h4><p class="section-copy mb-0">Offer skills, help someone get unstuck, and become part of a more connected local life.</p></div></div></div></div></section><section class="section-space pt-0"><div class="container"><div class="row g-4 align-items-center"><div class="col-lg-7"><div class="trust-panel"><div class="section-kicker mb-3">Popular ways to help</div><h2 class="section-heading mb-4">One platform. Many little wins.</h2><div class="d-flex flex-wrap gap-2">${categories.slice(0, 7).map((category) => `<a href="#/requests?category=${encodeURIComponent(category)}" data-route="requests" class="category-pill"><i>●</i>${escapeHtml(category)}</a>`).join("")}</div></div></div><div class="col-lg-5"><div class="ps-lg-4"><div class="section-kicker mb-3">A safer way to connect</div><h3>Before you say yes, see what matters.</h3><p class="section-copy">Every profile can show availability, skills, community reviews, completed tasks, and an administrator-controlled verification status. This is a project-level trust signal, not government-certified identity verification.</p><a class="btn btn-nh-soft" href="#/helpers" data-route="helpers">Meet local helpers →</a></div></div></div></div></section><a class="admin-panel-launcher" href="#/admin" data-route="admin" aria-label="Open Admin Panel">⚙ Admin Panel</a>`, "");
}

function authView(mode: "login" | "register") {
  const isRegister = mode === "register";
  return `<section class="auth-wrap"><div class="auth-panel"><a class="brand-mark mb-4" href="#/" data-route="home"><span class="brand-dot">N</span><span><span class="d-block">NeighbourHelp</span><span class="brand-sub">Help. Earn. Belong.</span></span></a><div class="section-kicker mb-2">${isRegister ? "Join the neighbourhood" : "Welcome back"}</div><h1 class="h2 mb-2">${isRegister ? "Start with one good step." : "Ready to make a difference?"}</h1><p class="section-copy mb-4">${isRegister ? "Create your account, then complete your trust profile." : "Sign in securely to access your requests and tasks."}</p>${!firebaseConfigured ? `${notice("Firebase keys are not configured yet. Use the secure workspace login below now, or add Firebase keys to activate email and social sign-in.", "info")}<button class="btn btn-nh-soft w-100 mb-4" type="button" data-action="manus-login">Continue with secure workspace login</button>` : ""}<div id="auth-notice"></div><div class="social-login-grid mb-4"><button class="btn social-btn social-google" type="button" data-social-provider="google"><span class="social-mark">G</span>Continue with Google</button><button class="btn social-btn social-facebook" type="button" data-social-provider="facebook"><span class="social-mark">f</span>Continue with Facebook</button><button class="btn social-btn social-twitter" type="button" data-social-provider="twitter"><span class="social-mark">◆</span>Continue with Twitter</button></div><div class="auth-divider"><span>or use email</span></div><form id="auth-form" novalidate>${isRegister ? `<div class="mb-3"><label class="form-label" for="fullName">Full name</label><input class="form-control" id="fullName" name="fullName" required autocomplete="name" placeholder="e.g. Aanya Shah"></div>` : ""}<div class="mb-3"><label class="form-label" for="email">Email address</label><input class="form-control" id="email" name="email" required type="email" autocomplete="email" placeholder="you@example.com"></div><div class="mb-3"><label class="form-label" for="password">Password</label><input class="form-control" id="password" name="password" required minlength="6" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="At least 6 characters"></div>${isRegister ? `<div class="mb-3"><label class="form-label" for="phone">Phone number <span class="text-secondary">(optional)</span></label><input class="form-control" id="phone" name="phone" autocomplete="tel" placeholder="Your preferred contact number"></div>` : ""}<button class="btn btn-nh-primary w-100" type="submit"><span class="submit-label">${isRegister ? "Create my account" : "Sign in"}</span><span class="spinner-border spinner-border-sm d-none ms-2" aria-hidden="true"></span></button></form><p class="text-center text-secondary small mt-4 mb-0">${isRegister ? "Already a member?" : "New to NeighbourHelp?"} <a class="text-decoration-underline" href="#/${isRegister ? "login" : "register"}" data-route="${isRegister ? "login" : "register"}">${isRegister ? "Sign in" : "Create an account"}</a></p><p class="small text-secondary mt-3 mb-0">Social providers must be enabled in Firebase Authentication and configured with their OAuth app credentials.</p></div></section>`;
}

function dashboard() {
  if (!state.firebaseUser) return shell(`<div class="container page-wrap"><div class="auth-panel mx-auto text-center"><div class="feature-icon mx-auto">↗</div><h2>Sign in to see your neighbourhood.</h2><p class="section-copy">Your dashboard brings requests, tasks, and trust signals together.</p><a href="#/login" data-route="login" class="btn btn-nh-primary">Sign in</a></div></div>`);
  return shell(`<div class="container dashboard-shell pb-5"><div class="row g-4"><div class="col-lg-3"><aside class="sidebar-panel"><div class="small text-white-50 mb-3">YOUR NEIGHBOURHOOD</div><a class="sidebar-link active" href="#/dashboard" data-route="dashboard">◌ <span>Overview</span></a><a class="sidebar-link" href="#/profile" data-route="profile">◎ <span>My profile</span></a><a class="sidebar-link" href="#/requests" data-route="requests">⌖ <span>Find help</span></a><a class="sidebar-link" href="#/create-request" data-route="create-request">＋ <span>Post a request</span></a><a class="sidebar-link" href="#/tasks" data-route="tasks">▣ <span>My tasks</span></a><a class="sidebar-link" href="#/ratings" data-route="ratings">★ <span>Ratings</span></a><hr class="border-light opacity-25"><a class="sidebar-link" href="#/helpers" data-route="helpers">♡ <span>Nearby helpers</span></a></aside></div><div class="col-lg-9"><div id="dashboard-content"><div class="empty-state">Loading your dashboard…</div></div></div></div></div>`);
}

function dashboardContent(data: any) {
  const profile = data?.profile ?? {};
  const requests = Array.isArray(data?.nearbyRequests) ? data.nearbyRequests : [];
  return `<div class="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-4"><div><div class="section-kicker mb-2">Your dashboard</div><h1 class="section-heading mb-1">Good to see you, ${escapeHtml(String(profile.full_name ?? state.firebaseUser?.displayName ?? state.sessionUser?.name ?? "neighbour").split(" ")[0])}.</h1><p class="section-copy mb-0">Here’s what is happening close to home.</p></div><a href="#/create-request" data-route="create-request" class="btn btn-nh-primary">＋ Post a request</a></div><div class="row g-3 mb-4"><div class="col-sm-4"><div class="dashboard-stat"><small>Open requests</small><div class="stat-number">${data?.openRequests ?? 0}</div></div></div><div class="col-sm-4"><div class="dashboard-stat"><small>Active tasks</small><div class="stat-number">${data?.activeTasks ?? 0}</div></div></div><div class="col-sm-4"><div class="dashboard-stat"><small>Your rating</small><div class="stat-number">${Number(profile.average_rating ?? 0).toFixed(1)} <span class="rating-stars fs-6">★</span></div></div></div></div><div class="dashboard-panel p-4 mb-4"><div class="d-flex justify-content-between align-items-center mb-3"><div><div class="section-kicker">Open nearby</div><h3 class="h4 mb-0">Requests that could use you</h3></div><a href="#/requests" data-route="requests" class="small text-decoration-underline">See all</a></div>${requests.length ? `<div class="row g-3">${requests.map((request: any) => requestCard(request)).join("")}</div>` : `<div class="empty-state">No nearby requests are available yet. Be the first to post one.</div>`}</div><div class="trust-panel d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-center"><div><div class="section-kicker mb-2">Trust profile</div><h3 class="h5 mb-1">${profile.verification_status ?? "Not Verified"}</h3><p class="section-copy mb-0">${profile.completed_tasks ?? 0} completed tasks · Firebase account connected</p></div><a href="#/profile" data-route="profile" class="btn btn-nh-soft">Complete your profile →</a></div>`;
}

function requestCard(request: any) {
  return `<div class="col-md-6"><article class="request-card"><div class="d-flex justify-content-between gap-2 mb-3"><span class="badge rounded-pill badge-soft">${escapeHtml(request.category)}</span><span class="small text-secondary">${escapeHtml(request.status ?? "Open")}</span></div><h3 class="h5 mb-2">${escapeHtml(request.title)}</h3><p class="section-copy small mb-3">${escapeHtml(String(request.description ?? "A neighbour is looking for a hand.").slice(0, 120))}</p><div class="d-flex justify-content-between small text-secondary mb-3"><span>⌖ ${escapeHtml(request.location ?? "Nearby")}</span><strong class="text-dark">${money(request.budget_min)}–${money(request.budget_max)}</strong></div><div class="d-flex justify-content-between align-items-center"><span class="small">${escapeHtml(request.requester_name ?? "Neighbour")} · <span class="rating-stars">★</span> ${Number(request.requester_rating ?? 0).toFixed(1)}</span><a class="btn btn-sm btn-nh-soft" href="#/request/${request.id}" data-route="request">View</a></div></article></div>`;
}

function requestDetailView() {
  return shell(`<div class="container page-wrap"><a href="#/requests" data-route="requests" class="small text-decoration-underline">← Back to open requests</a><div id="request-detail" class="mt-4"><div class="empty-state">Loading request details…</div></div></div>`);
}

function requestsView() {
  return shell(`<div class="container page-wrap"><div class="row g-4"><div class="col-lg-7"><div class="section-kicker mb-2">Find help</div><h1 class="section-heading mb-2">Small requests. Real impact.</h1><p class="section-copy mb-4">Browse open requests around you, filter by the kind of help you can offer, and make a practical difference.</p><form id="request-filters" class="row g-2 mb-4"><div class="col-md-5"><label class="visually-hidden" for="filterCategory">Category</label><select class="form-select" id="filterCategory"><option value="">All categories</option>${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></div><div class="col-md-4"><label class="visually-hidden" for="filterStatus">Status</label><select class="form-select" id="filterStatus"><option value="Open">Open requests</option><option value="">All statuses</option></select></div><div class="col-md-3"><button class="btn btn-nh-primary w-100" type="submit">Filter</button></div></form><div id="requests-list"><div class="empty-state">Loading nearby requests…</div></div></div><div class="col-lg-5"><div class="dashboard-panel p-3 sticky-lg-top" style="top:6.5rem"><div class="d-flex justify-content-between align-items-center px-2 py-2"><div><div class="section-kicker">Map view</div><h3 class="h5 mb-0">Open around you</h3></div><span class="badge rounded-pill badge-soft">OpenStreetMap</span></div><div class="d-flex align-items-center gap-2 px-2 pt-2"><button class="btn btn-sm btn-nh-soft" type="button" data-action="use-live-location" data-map-target="requests-map" data-status-target="requests-location-status">⌖ Use my live location</button><span id="requests-location-status" class="small text-secondary">Location not shared</span></div><div id="requests-map" class="map-canvas mt-2"></div><p class="small text-secondary px-2 pt-3 mb-0">Your browser asks permission before sharing your live location. The map uses it only to center nearby discovery; exact addresses stay private.</p></div></div></div></div>`);
}

function helpersView() {
  return shell(`<div class="container page-wrap"><div class="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-4"><div><div class="section-kicker mb-2">Nearby helpers</div><h1 class="section-heading mb-2">People who show up.</h1><p class="section-copy mb-0">Sort by distance, then look for the skills and trust signals that fit your request.</p></div><a href="#/profile" data-route="profile" class="btn btn-nh-soft">Become a helper →</a></div><div id="helpers-list" class="row g-3"><div class="empty-state">Finding helpers near you…</div></div></div>`);
}

function helperCard(helper: any) {
  return `<div class="col-md-6 col-xl-4"><article class="profile-card p-3 h-100"><div class="d-flex align-items-center gap-3 mb-3"><div class="brand-dot">${escapeHtml(String(helper.full_name ?? "N").slice(0, 1).toUpperCase())}</div><div><h3 class="h5 mb-1">${escapeHtml(helper.full_name)}</h3><span class="small text-secondary">${helper.availability ? escapeHtml(helper.availability) : "Availability not shared"}</span></div></div><p class="small text-secondary mb-3">${escapeHtml(helper.skills ?? "Neighbourhood support")}</p><div class="d-flex gap-3 small mb-3"><span><span class="rating-stars">★</span> ${Number(helper.average_rating ?? 0).toFixed(1)}</span><span>${helper.completed_tasks ?? 0} tasks</span>${helper.distance_km != null ? `<span>${Number(helper.distance_km).toFixed(1)} km</span>` : ""}</div><div class="d-flex justify-content-between align-items-center"><span class="badge rounded-pill ${helper.is_verified ? "badge-soft" : "badge-warm"}">${escapeHtml(helper.verification_status ?? "Not Verified")}</span><a class="btn btn-sm btn-nh-outline" href="#/helper/${helper.id}" data-route="helper">View profile</a></div></article></div>`;
}

function createRequestView() {
  if (!isAuthenticated()) return shell(`<div class="container page-wrap"><div class="auth-panel mx-auto text-center"><h2>Sign in to post a request.</h2><p class="section-copy">Your account keeps your request history connected to you.</p><a href="#/login" data-route="login" class="btn btn-nh-primary">Sign in</a></div></div>`);
  return shell(`<div class="container page-wrap"><div class="row justify-content-center"><div class="col-xl-9"><div class="section-kicker mb-2">Ask your neighbourhood</div><h1 class="section-heading mb-2">What would make today easier?</h1><p class="section-copy mb-4">Share the details a nearby helper needs. You can edit an open request later.</p><div id="create-notice"></div><form id="create-request-form" class="dashboard-panel p-4"><div class="row g-3"><div class="col-md-8"><label class="form-label" for="requestTitle">Request title</label><input class="form-control" id="requestTitle" name="title" required maxlength="160" placeholder="e.g. Help carrying a parcel upstairs"></div><div class="col-md-4"><label class="form-label" for="requestCategory">Category</label><select class="form-select" id="requestCategory" name="category" required><option value="">Choose one</option>${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></div><div class="col-12"><label class="form-label" for="requestDescription">What kind of help do you need?</label><textarea class="form-control" id="requestDescription" name="description" rows="4" required placeholder="Add helpful context, access details, or anything a helper should know."></textarea></div><div class="col-md-7"><label class="form-label" for="requestLocation">Neighbourhood / approximate location</label><input class="form-control" id="requestLocation" name="location" required placeholder="e.g. Bandra West"></div><div class="col-md-5"><label class="form-label" for="requestDate">Preferred date</label><input class="form-control" id="requestDate" name="preferredDate" type="date"></div><div class="col-md-4"><label class="form-label" for="requestTime">Preferred time</label><input class="form-control" id="requestTime" name="preferredTime" placeholder="e.g. 5:30 PM"></div><div class="col-md-4"><label class="form-label" for="budgetMin">Budget minimum (₹)</label><input class="form-control" id="budgetMin" name="budgetMin" type="number" min="0" step="50" value="0"></div><div class="col-md-4"><label class="form-label" for="budgetMax">Budget maximum (₹)</label><input class="form-control" id="budgetMax" name="budgetMax" type="number" min="0" step="50" value="0"></div><div class="col-12"><div class="location-picker-panel"><div class="d-flex flex-column flex-sm-row justify-content-between gap-2 align-items-sm-center"><div><strong>Share your approximate location</strong><p class="small text-secondary mb-0">Required so an accepted helper can receive an approximate route.</p></div><button class="btn btn-sm btn-nh-soft" type="button" data-action="use-live-location" data-map-target="create-request-map" data-status-target="create-location-status" data-latitude-target="requestLatitude" data-longitude-target="requestLongitude" data-location-target="requestLocation">⌖ Use my live location</button></div><div id="create-location-status" class="small text-secondary mt-2">Location not shared</div><div id="create-request-map" class="map-canvas map-picker mt-3"></div><input type="hidden" id="requestLatitude" name="latitude"><input type="hidden" id="requestLongitude" name="longitude"></div></div><div class="col-12"><div class="notice notice-info">Your exact address is never shown on public request cards. Only an approximate map point is saved for helper routing.</div></div><div class="col-12 d-flex justify-content-end"><button class="btn btn-nh-primary" type="submit">Post request <span class="spinner-border spinner-border-sm d-none ms-2" aria-hidden="true"></span></button></div></div></form></div></div></div>`);
}

function profileView() {
  if (!isAuthenticated()) return shell(`<div class="container page-wrap"><div class="auth-panel mx-auto text-center"><h2>Sign in to manage your profile.</h2><a href="#/login" data-route="login" class="btn btn-nh-primary">Sign in</a></div></div>`);
  return shell(`<div class="container page-wrap"><div class="row justify-content-center"><div class="col-xl-9"><div class="section-kicker mb-2">Trust profile</div><h1 class="section-heading mb-2">Let neighbours know how you help.</h1><p class="section-copy mb-4">A thoughtful profile makes it easier for people to choose the right helper.</p><div id="profile-notice"></div><div id="profile-form-wrap"><div class="empty-state">Loading your profile…</div></div></div></div></div>`);
}

function tasksView() {
  if (!isAuthenticated()) return shell(`<div class="container page-wrap"><div class="auth-panel mx-auto text-center"><h2>Sign in to see your tasks.</h2><a href="#/login" data-route="login" class="btn btn-nh-primary">Sign in</a></div></div>`);
  return shell(`<div class="container page-wrap"><div class="section-kicker mb-2">Your activity</div><h1 class="section-heading mb-2">Tasks, from accepted to done.</h1><p class="section-copy mb-4">Keep every commitment visible, with status updates that only the right participants can make.</p><div id="tasks-list"><div class="empty-state">Loading your tasks…</div></div></div>`);
}

function ratingsView() {
  return shell(`<div class="container page-wrap"><div class="section-kicker mb-2">Ratings & reviews</div><h1 class="section-heading mb-2">Good work deserves to be remembered.</h1><p class="section-copy mb-4">After a task is completed, both people can leave a 1–5 star rating and a thoughtful review.</p><div class="trust-panel"><h3 class="h5">How trust builds here</h3><div class="row g-3 mt-1"><div class="col-md-4"><strong>01 · Show up</strong><p class="small text-secondary mb-0">Keep commitments and communicate clearly.</p></div><div class="col-md-4"><strong>02 · Complete</strong><p class="small text-secondary mb-0">Update the task so the other person always knows.</p></div><div class="col-md-4"><strong>03 · Reflect</strong><p class="small text-secondary mb-0">Leave an honest review that helps the next neighbour.</p></div></div></div></div>`);
}

function adminLoginView() {
  return `<section class="auth-wrap"><div class="auth-panel"><div class="section-kicker mb-2">Separate administrator access</div><h1 class="h2 mb-2">NeighbourHelp console</h1><p class="section-copy mb-4">Use the local administrator credentials, or sign in with an authorized Firebase account.</p><div id="admin-login-notice"></div><form id="admin-login-form"><div class="mb-3"><label class="form-label" for="adminEmail">Admin username or Firebase email</label><input class="form-control" id="adminEmail" name="username" required autocomplete="username" placeholder="admin"></div><div class="mb-3"><label class="form-label" for="adminPassword">Password</label><input class="form-control" id="adminPassword" name="password" required type="password" autocomplete="current-password" placeholder="Enter administrator password"></div><button class="btn btn-nh-primary w-100" type="submit">Open admin dashboard</button></form><p class="small text-secondary mt-4 mb-0">Local compatibility login is available for this project. Firebase administrator authorization remains supported when configured.</p></div></section>`;
}

function adminDashboardView() {
  return `<div class="container page-wrap"><div class="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-4"><div><div class="section-kicker mb-2">Administrator console</div><h1 class="section-heading mb-2">Keep the neighbourhood healthy.</h1><p class="section-copy mb-0">Live database statistics and moderation tools.</p></div><button class="btn btn-nh-outline" data-action="admin-logout">Sign out</button></div><div id="admin-dashboard-content"><div class="empty-state">Loading live statistics…</div></div></div>`;
}

function mapView(targetId: string, points: any[] = [], routeTarget?: { latitude: number; longitude: number }) {
  const node = document.getElementById(targetId);
  if (!node) return;
  if (mapResizeTimers[targetId] !== undefined) window.clearTimeout(mapResizeTimers[targetId]);
  const previousMap = maps[targetId];
  if (previousMap) {
    try { previousMap.remove(); } catch { /* stale Leaflet instances can already be detached during route changes */ }
    delete maps[targetId];
  }
  const center = state.liveLocation ? [state.liveLocation.latitude, state.liveLocation.longitude] as [number, number] : [19.076, 72.8777] as [number, number];
  const map = L.map(node).setView(center, state.liveLocation ? 14 : 11);
  maps[targetId] = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
  const icon = L.icon({ iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41] });
  points.filter((point) => point.latitude != null && point.longitude != null).forEach((point) => L.marker([Number(point.latitude), Number(point.longitude)], { icon }).addTo(map).bindPopup(`<strong>${escapeHtml(point.title ?? point.full_name ?? "NeighbourHelp")}</strong><br>${escapeHtml(point.location ?? point.skills ?? "Nearby")}`));
  if (state.liveLocation) {
    const live = L.circleMarker([state.liveLocation.latitude, state.liveLocation.longitude], { radius: 9, color: "#0f766e", fillColor: "#7dd3c7", fillOpacity: .9, weight: 3 }).addTo(map);
    live.bindPopup("Your live location").openPopup();
    L.circle([state.liveLocation.latitude, state.liveLocation.longitude], { radius: state.liveLocation.accuracy, color: "#0f766e", fillColor: "#7dd3c7", fillOpacity: .12, weight: 1 }).addTo(map);
  }
  if (routeTarget && state.liveLocation) {
    const route = L.polyline([[state.liveLocation.latitude, state.liveLocation.longitude], [routeTarget.latitude, routeTarget.longitude]], { color: "#ef795d", weight: 5, dashArray: "10 8" }).addTo(map);
    route.bindPopup("Approximate route — follow local roads and confirm the exact meeting point privately.");
    map.fitBounds(route.getBounds(), { padding: [28, 28] });
  }
  mapResizeTimers[targetId] = window.setTimeout(() => {
    delete mapResizeTimers[targetId];
    if (maps[targetId] !== map || !document.body.contains(node)) return;
    try { map.invalidateSize({ pan: false }); } catch { /* ignore a resize racing with route teardown */ }
  }, 150);
}

function useLiveLocation(mapTarget: string, statusTarget: string, latitudeTarget?: string, longitudeTarget?: string, locationTarget?: string) {
  const status = document.getElementById(statusTarget);
  if (!navigator.geolocation) {
    state.locationMessage = "Location is not supported by this browser.";
    if (status) status.textContent = state.locationMessage;
    return;
  }
  if (status) status.textContent = "Requesting permission…";
  navigator.geolocation.getCurrentPosition((position) => {
    state.liveLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
    state.locationMessage = `Live location ready · ±${Math.round(position.coords.accuracy)} m`;
    if (status) status.textContent = state.locationMessage;
    if (latitudeTarget) $(`#${latitudeTarget}`).val(state.liveLocation.latitude.toFixed(7));
    if (longitudeTarget) $(`#${longitudeTarget}`).val(state.liveLocation.longitude.toFixed(7));
    if (locationTarget && !String($(`#${locationTarget}`).val() ?? "").trim()) $(`#${locationTarget}`).val("Live location area");
    mapView(mapTarget, mapTarget === "requests-map" ? [] : [], mapTarget === "request-route-map" && state.routeRequest ? { latitude: Number(state.routeRequest.latitude), longitude: Number(state.routeRequest.longitude) } : undefined);
    if (mapTarget === "request-route-map" && state.routeRequest) showApproximateRoute(state.routeRequest);
    if (mapTarget === "requests-map") void hydrateRequests();
  }, (error) => {
    state.locationMessage = error.code === error.PERMISSION_DENIED ? "Location permission was declined." : "Unable to read your location right now.";
    if (status) status.textContent = state.locationMessage;
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function captureRequesterLocation(): Promise<GeoPoint> {
  if (state.liveLocation) return Promise.resolve(state.liveLocation);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not supported by this browser."));
    $("#create-location-status").text("Requesting your approximate location…");
    navigator.geolocation.getCurrentPosition((position) => {
      state.liveLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      $("#requestLatitude").val(state.liveLocation.latitude.toFixed(7));
      $("#requestLongitude").val(state.liveLocation.longitude.toFixed(7));
      if (!String($("#requestLocation").val() ?? "").trim()) $("#requestLocation").val("Live location area");
      $("#create-location-status").text(`Requester location saved · ±${Math.round(state.liveLocation.accuracy)} m`);
      mapView("create-request-map");
      resolve(state.liveLocation);
    }, (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Please allow location access so helpers can receive an approximate route." : "Unable to capture your location right now.")), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

async function hydrateRequests() {
  const list = $("#requests-list");
  try {
    const category = String($("#filterCategory").val() ?? "");
    const status = String($("#filterStatus").val() ?? "Open");
    const response = await api<{ requests: any[] }>(`/api/requests?${new URLSearchParams({ ...(category ? { category } : {}), ...(status ? { status } : {}) })}`);
    const requests = response.data?.requests ?? [];
    list.html(requests.length ? `<div class="row g-3">${requests.map(requestCard).join("")}</div>` : `<div class="empty-state">No matching requests yet. Try another filter or post the first one.</div>`);
    mapView("requests-map", requests);
  } catch {
    list.html(`<div class="notice notice-info">The API is online, but the MySQL database is not connected in this environment yet. Add DATABASE_URL and import database/schema.sql to show live requests.</div>`);
    mapView("requests-map", []);
  }
}

function showApproximateRoute(request: any) {
  const wrap = $("#request-route-wrap");
  if (!wrap.length) return;
  wrap.removeClass("d-none");
  if (request?.latitude == null || request?.longitude == null) {
    $("#route-status").text("This request has no map point yet. Ask the requester to share an approximate location.");
    return;
  }
  if (!state.liveLocation) {
    $("#route-status").text("Share your live location to draw an approximate route.");
    return;
  }
  $("#route-status").text("Approximate route shown — confirm the exact meeting point privately.");
  mapView("request-route-map", [request], { latitude: Number(request.latitude), longitude: Number(request.longitude) });
}

async function hydrateRequestDetail(requestId: string) {
  try {
    const response = await api<{ request: any }>(`/api/requests/${encodeURIComponent(requestId)}`);
    const request = response.data?.request;
    if (!response.success || !request) throw new Error(response.message ?? "Request not found");
    const canAccept = request.status === "Open" && !request.helper_id;
    state.routeRequest = request;
    $("#request-detail").html(`<div class="row g-4"><div class="col-lg-8"><div class="section-kicker mb-2">${escapeHtml(request.category)}</div><h1 class="section-heading mb-3">${escapeHtml(request.title)}</h1><p class="section-copy mb-4">${escapeHtml(request.description)}</p><div class="request-detail-meta"><span>⌖ ${escapeHtml(request.location ?? "Nearby")}</span><span>◷ ${escapeHtml(request.preferred_date ? new Date(request.preferred_date).toLocaleDateString() : "Flexible date")}</span><strong>${money(request.budget_min)}–${money(request.budget_max)}</strong></div><div class="dashboard-panel p-4 mt-4"><div class="section-kicker mb-2">Neighbour request</div><p class="mb-0">Posted by <strong>${escapeHtml(request.requester_name ?? "Neighbour")}</strong> · <span class="rating-stars">★</span> ${Number(request.requester_rating ?? 0).toFixed(1)}</p></div></div><div class="col-lg-4"><div class="dashboard-panel p-4 sticky-lg-top" style="top:6.5rem"><span class="badge rounded-pill badge-soft mb-3">${escapeHtml(request.status ?? "Open")}</span>${canAccept ? `<button class="btn btn-nh-primary w-100 mb-2" id="accept-request" data-request-id="${request.id}">Accept this request</button>` : `<div class="notice notice-info mb-3">${request.helper_id ? `This request is assigned to ${escapeHtml(request.helper_name ?? "a helper")}.` : "This request is no longer open."}</div>`}<button class="btn btn-nh-outline w-100" type="button" data-action="show-message-form">Send a message</button><form id="message-request-form" class="d-none mt-3"><label class="form-label" for="requestMessage">Message</label><textarea class="form-control mb-2" id="requestMessage" name="message" rows="4" required maxlength="2000" placeholder="Introduce yourself or ask a helpful question."></textarea><button class="btn btn-nh-soft w-100" type="submit">Send message</button><div id="message-notice" class="mt-2"></div></form><div id="request-action-notice" class="mt-3"></div><div id="request-route-wrap" class="d-none mt-4"><div class="section-kicker mb-2">Approximate route</div><p id="route-status" class="small text-secondary mb-2">Share your live location to draw a route.</p><button class="btn btn-sm btn-nh-soft mb-2" type="button" data-action="use-live-location" data-map-target="request-route-map" data-status-target="route-status">⌖ Use my live location</button><div id="request-route-map" class="map-canvas map-picker"></div></div></div></div></div>`);
  } catch (error) {
    $("#request-detail").html(notice(error instanceof Error ? error.message : "Unable to load this request", "danger"));
  }
}

async function hydrateHelpers() {
  try {
    const response = await api<{ helpers: any[] }>("/api/users/helpers");
    const helpers = response.data?.helpers ?? [];
    $("#helpers-list").html(helpers.length ? helpers.map(helperCard).join("") : `<div class="col-12"><div class="empty-state">No helper profiles are available yet. Complete your profile and become the first.</div></div>`);
  } catch {
    $("#helpers-list").html(`<div class="col-12">${notice("The helper directory will appear after MySQL is connected and members complete their profiles.", "info")}</div>`);
  }
}

async function hydrateDashboard() {
  try {
    const response = await api<any>("/api/dashboard");
    if (response.success) $("#dashboard-content").html(dashboardContent(response.data));
    else $("#dashboard-content").html(notice(response.message ?? "Please complete your profile.", "info"));
  } catch {
    $("#dashboard-content").html(notice("Your Firebase session is ready. Connect MySQL and import database/schema.sql to load dashboard data.", "info"));
  }
}

async function hydrateProfile() {
  try {
    const response = await api<any>("/api/users/profile");
    const user = response.data?.user ?? {};
    const helperApplicationStatus = String(user.helper_application_status ?? "");
    const helperApproved = Boolean(user.is_helper);
    const helperPending = helperApplicationStatus === "Pending";
    $("#profile-form-wrap").html(`<form id="profile-form" class="dashboard-panel p-4"><div class="row g-3"><div class="col-md-6"><label class="form-label" for="profileName">Full name</label><input class="form-control" id="profileName" name="fullName" required value="${escapeHtml(user.full_name ?? state.firebaseUser?.displayName ?? state.sessionUser?.name ?? "")}"></div><div class="col-md-6"><label class="form-label" for="profileEmail">Email</label><input class="form-control" id="profileEmail" disabled value="${escapeHtml(user.email ?? state.firebaseUser?.email ?? state.sessionUser?.email ?? "")}"></div><div class="col-md-6"><label class="form-label" for="profilePhone">Phone</label><input class="form-control" id="profilePhone" name="phone" value="${escapeHtml(user.phone ?? "")}"></div><div class="col-md-6"><label class="form-label" for="profileAvailability">Availability</label><input class="form-control" id="profileAvailability" name="availability" placeholder="Weekdays after 6 PM" value="${escapeHtml(user.availability ?? "")}"></div><div class="col-12"><label class="form-label" for="profileSkills">Skills</label><input class="form-control" id="profileSkills" name="skills" placeholder="Tutoring, errands, tech help" value="${escapeHtml(user.skills ?? "")}"></div><div class="col-12"><label class="form-label" for="profileBio">Bio</label><textarea class="form-control" id="profileBio" name="bio" rows="4" placeholder="A little about how you like to help.">${escapeHtml(user.bio ?? "")}</textarea></div><div class="col-md-8"><label class="form-label" for="profileAddress">Approximate address / neighbourhood</label><input class="form-control" id="profileAddress" name="address" value="${escapeHtml(user.address ?? "")}"></div><div class="col-md-4 d-flex align-items-end"><div class="form-check mb-2"><input class="form-check-input" id="profileHelper" name="isHelper" type="checkbox" data-approved="${helperApproved ? "true" : "false"}" ${helperApproved || helperPending ? "checked" : ""} ${helperPending ? "disabled" : ""}><label class="form-check-label" for="profileHelper">I want to help nearby</label></div></div><div class="col-md-4 d-flex align-items-end"><div class="form-check mb-2"><input class="form-check-input" id="profileRequester" name="isRequester" type="checkbox" ${user.is_requester !== 0 ? "checked" : ""}><label class="form-check-label" for="profileRequester">I may request help</label></div></div><div class="col-12"><div class="helper-application-panel"><div class="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-center"><div><strong>Helper application</strong><p class="small text-secondary mb-0">Complete your name, phone, skills, bio, availability, and neighbourhood above, then submit your profile for administrator approval.</p></div><button class="btn btn-sm btn-nh-primary" type="button" id="submit-helper-application" ${helperApproved || helperPending ? "disabled" : ""}>${helperPending ? "Application pending" : helperApproved ? "Helper approved" : "Submit for approval"}</button></div>${helperApplicationStatus ? `<div class="small mt-2">Latest application: <strong>${escapeHtml(helperApplicationStatus)}</strong></div>` : ""}</div></div><div class="col-12"><div class="notice notice-info">Verification is administrator-controlled for this project. It is not government-certified identity verification.</div></div><div class="col-12 d-flex justify-content-between align-items-center"><span class="small text-secondary">${escapeHtml(user.verification_status ?? "Not Verified")} · ${user.completed_tasks ?? 0} completed · ${Number(user.average_rating ?? 0).toFixed(1)} rating</span><button class="btn btn-nh-primary" type="submit">Save profile</button></div></div></form>`);
  } catch {
    $("#profile-form-wrap").html(notice("Connect MySQL and import database/schema.sql to save your profile.", "info"));
  }
}

async function hydrateTasks() {
  try {
    const response = await api<{ tasks: any[] }>("/api/tasks");
    const tasks = response.data?.tasks ?? [];
    $("#tasks-list").html(tasks.length ? `<div class="row g-3">${tasks.map((task: any) => `<div class="col-md-6"><article class="request-card"><div class="d-flex justify-content-between mb-3"><span class="badge rounded-pill badge-soft">${escapeHtml(task.status)}</span><span class="small text-secondary">#${task.id}</span></div><h3 class="h5">${escapeHtml(task.title)}</h3><p class="small text-secondary">${escapeHtml(task.category)} · ${escapeHtml(task.location)}</p><div class="small mb-3">Requester: ${escapeHtml(task.requester_name)}<br>Helper: ${escapeHtml(task.helper_name)}</div><div class="d-flex gap-2">${task.status === "Accepted" ? `<button class="btn btn-sm btn-nh-soft" data-task-status="In Progress" data-task-id="${task.id}">Start</button>` : ""}${task.status === "In Progress" ? `<button class="btn btn-sm btn-nh-primary" data-task-status="Completed" data-task-id="${task.id}">Mark completed</button>` : ""}<a class="btn btn-sm btn-nh-outline" href="#/task/${task.id}" data-route="task">Details</a></div></article></div>`).join("")}</div>` : `<div class="empty-state">You have no tasks yet. Browse open requests to find a way to help.</div>`);
  } catch {
    $("#tasks-list").html(notice("Connect MySQL and import database/schema.sql to load tasks.", "info"));
  }
}

async function hydrateAdmin() {
  try {
    const [summaryResponse, usersResponse, verificationResponse] = await Promise.all([
      api<any>("/api/admin/dashboard"),
      api<{ users: any[] }>("/api/admin/users?search="),
      api<{ verifications: any[] }>("/api/admin/verifications"),
    ]);
    if (!summaryResponse.success) { $("#admin-dashboard-content").html(notice(summaryResponse.message ?? "Admin session required", "danger")); return; }
    const s = summaryResponse.data;
    const users = usersResponse.data?.users ?? [];
    const verifications = verificationResponse.data?.verifications ?? [];
    const userRows = users.length ? users.map((user: any) => `<tr><td><strong>${escapeHtml(user.full_name ?? "Unnamed")}</strong><br><small class="text-secondary">${escapeHtml(user.email ?? "")}</small></td><td>${user.is_helper ? "Helper" : "Member"}${user.is_requester ? " · Requester" : ""}</td><td><span class="badge rounded-pill ${user.is_verified ? "badge-soft" : "badge-warm"}">${escapeHtml(user.verification_status ?? "Not Verified")}</span></td><td><div class="d-flex gap-2"><button class="btn btn-sm btn-nh-primary" data-admin-user-action="verify" data-user-id="${user.id}" ${user.is_verified ? "disabled" : ""}>Verify</button><button class="btn btn-sm btn-nh-outline" data-admin-user-action="unverify" data-user-id="${user.id}" ${user.is_verified ? "" : "disabled"}>Reject</button></div></td></tr>`).join("") : `<tr><td colspan="4" class="text-secondary">No customer profiles found.</td></tr>`;
    const verificationRows = verifications.length ? verifications.map((item: any) => `<tr><td><strong>${escapeHtml(item.full_name ?? "User")}</strong><br><small class="text-secondary">${escapeHtml(item.email ?? "")}</small></td><td><strong>${escapeHtml(item.verification_type ?? "Profile")}</strong><br><small class="text-secondary">${escapeHtml(item.document_reference ?? "Profile details submitted")}</small></td><td><span class="badge rounded-pill ${item.status === "Pending" ? "badge-warm" : "badge-soft"}">${escapeHtml(item.status)}</span></td><td><div class="d-flex gap-2"><button class="btn btn-sm btn-nh-primary" data-admin-verification-action="Approved" data-verification-id="${item.id}" ${item.status !== "Pending" ? "disabled" : ""}>Approve</button><button class="btn btn-sm btn-nh-outline" data-admin-verification-action="Rejected" data-verification-id="${item.id}" ${item.status !== "Pending" ? "disabled" : ""}>Reject</button></div></td></tr>`).join("") : `<tr><td colspan="4" class="text-secondary">No helper applications are waiting for approval.</td></tr>`;
    $("#admin-dashboard-content").html(`<div class="row g-3 mb-4">${[["Total users", s.totalUsers], ["Verified users", s.verifiedUsers], ["Total requests", s.totalRequests], ["Open requests", s.openRequests], ["Active tasks", s.activeTasks], ["Completed tasks", s.completedTasks], ["Total reviews", s.totalReviews]].map(([label, value]) => `<div class="col-sm-6 col-xl-3"><div class="dashboard-stat"><small>${label}</small><div class="stat-number">${value}</div></div></div>`).join("")}</div><div id="admin-action-notice"></div><div class="dashboard-panel p-4 mb-4"><div class="d-flex flex-column flex-md-row justify-content-between gap-2 mb-3"><div><div class="section-kicker">Profile verification</div><h3 class="h4 mb-0">Review every customer</h3></div><span class="small text-secondary">Verify or reject directly from this table</span></div><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Customer</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead><tbody>${userRows}</tbody></table></div></div><div class="dashboard-panel p-4"><div class="section-kicker mb-2">Helper applications for approval</div><h3 class="h4 mb-2">Pending helper profiles</h3><p class="small text-secondary mb-3">Review the submitted profile details, then approve or reject the helper application.</p><div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Customer</th><th>Application</th><th>Status</th><th>Actions</th></tr></thead><tbody>${verificationRows}</tbody></table></div></div>`);
  } catch (error) { $("#admin-dashboard-content").html(notice(apiErrorMessage(error, "The admin session is not available or the database is not configured."), "danger")); }
}

function bindViewEvents(route: string) {
  $(`[data-action=manus-login]`).on("click", () => startLogin());
  $(`[data-social-provider]`).on("click", async function () {
    const button = $(this); const provider = String(button.data("social-provider")) as SocialProvider;
    if (!firebaseConfigured) { startLogin(); return; }
    button.prop("disabled", true);
    try {
      const user = await signInWithSocialProvider(provider);
      await api("/api/auth/register", { method: "POST", contentType: "application/json", data: JSON.stringify({ fullName: user.displayName ?? "", phone: "" }) });
      continueAfterAuth();
    } catch (error) {
      $("#auth-notice").html(notice(error instanceof Error ? error.message : "Unable to continue with this provider", "danger"));
    } finally { button.prop("disabled", false); }
  });
  $(document).off("click.neighbourhelp", "[data-action=use-live-location]").on("click.neighbourhelp", "[data-action=use-live-location]", function () {
    const button = $(this);
    useLiveLocation(String(button.data("map-target")), String(button.data("status-target")), button.data("latitude-target"), button.data("longitude-target"), button.data("location-target"));
  });
  $(document).off("click.neighbourhelp", "[data-action=show-message-form]").on("click.neighbourhelp", "[data-action=show-message-form]", () => $("#message-request-form").removeClass("d-none"));
  $(document).off("click.neighbourhelp", "#accept-request").on("click.neighbourhelp", "#accept-request", async function () {
    const button = $(this); button.prop("disabled", true);
    if (!isAuthenticated()) { $("#request-action-notice").html(authActionNotice("Sign in before accepting a request.")); button.prop("disabled", false); return; }
    try {
      const response = await api(`/api/tasks/${button.data("request-id")}/accept`, { method: "POST", contentType: "application/json", data: JSON.stringify({}) });
      if (!response.success) throw new Error(response.message);
      state.routeRequest = { ...state.routeRequest, status: "Accepted", helper_id: state.firebaseUser?.uid ?? true };
      $("#request-action-notice").html(notice("Request accepted. You can now coordinate with the neighbour.", "success"));
      showApproximateRoute(state.routeRequest);
      button.replaceWith(`<button class="btn btn-nh-soft w-100 mb-2" type="button" data-action="show-requester-route">Show route to requester</button><a class="btn btn-nh-outline w-100" href="#/tasks" data-route="tasks">Open my task</a>`);
    } catch (error) { const message = apiErrorMessage(error, "Unable to accept this request"); $("#request-action-notice").html(message.toLowerCase().includes("authentication required") ? authActionNotice(message) : notice(message, "danger")); button.prop("disabled", false); }
  });
  $(document).off("click.neighbourhelp", "[data-action=show-requester-route]").on("click.neighbourhelp", "[data-action=show-requester-route]", () => {
    if (state.liveLocation) showApproximateRoute(state.routeRequest);
    else useLiveLocation("request-route-map", "route-status");
  });
  $(document).off("submit.neighbourhelp", "#message-request-form").on("submit.neighbourhelp", "#message-request-form", async function (event) {
    event.preventDefault(); const form = this as HTMLFormElement;
    if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
    if (!isAuthenticated()) { $("#message-notice").html(authActionNotice("Sign in before messaging the requester.")); return; }
    const requestId = state.routeRequest?.id ?? window.location.hash.split("/")[2];
    try { const response = await api("/api/messages", { method: "POST", contentType: "application/json", data: JSON.stringify({ requestId, body: String($("#requestMessage").val() ?? "") }) }); if (!response.success) throw new Error(response.message); $("#message-notice").html(notice("Message sent.", "success")); form.reset(); } catch (error) { const message = apiErrorMessage(error, "Unable to send message"); $("#message-notice").html(message.toLowerCase().includes("authentication required") ? authActionNotice(message) : notice(message, "danger")); }
  });
  if (route === "login" || route === "register") $("#auth-form").on("submit", async function (event) {
    event.preventDefault();
    if (!firebaseConfigured) { startLogin(); return; }
    const form = this as HTMLFormElement;
    if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
    const button = $(form).find("button[type=submit]"); button.prop("disabled", true).find(".spinner-border").removeClass("d-none");
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (route === "login") {
        const user = await firebaseSignIn(String(data.email), String(data.password));
        await api("/api/auth/login", { method: "POST", contentType: "application/json", data: JSON.stringify({ fullName: user.displayName ?? "" }) });
      }
      else {
        await firebaseRegister(String(data.email), String(data.password), String(data.fullName));
        await api("/api/auth/register", { method: "POST", contentType: "application/json", data: JSON.stringify({ fullName: data.fullName, phone: data.phone }) });
      }
      continueAfterAuth();
    } catch (error) {
      $("#auth-notice").html(notice(error instanceof Error ? error.message : "Unable to complete authentication", "danger"));
    } finally { button.prop("disabled", false).find(".spinner-border").addClass("d-none"); }
  });
  $("#request-filters").on("submit", (event) => { event.preventDefault(); void hydrateRequests(); });
  $("#create-request-form").on("submit", async function (event) {
    event.preventDefault(); const form = this as HTMLFormElement; if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
    const button = $(form).find("button[type=submit]"); button.prop("disabled", true);
    try { const location = await captureRequesterLocation(); const data = { ...Object.fromEntries(new FormData(form).entries()), latitude: location.latitude.toFixed(7), longitude: location.longitude.toFixed(7) }; const response = await api("/api/requests", { method: "POST", contentType: "application/json", data: JSON.stringify(data) }); if (!response.success) throw new Error(response.message); $("#create-notice").html(notice("Your request is live with an approximate requester location for helper routing.", "success")); form.reset(); state.liveLocation = null; } catch (error) { $("#create-notice").html(notice(error instanceof Error ? error.message : "Unable to post request", "danger")); } finally { button.prop("disabled", false); }
  });
  async function autoSaveRoles(): Promise<boolean> {
    try {
      const data = Object.fromEntries(new FormData($("#profile-form")[0] as HTMLFormElement).entries());
      const approved = $("#profileHelper").data("approved") === true || String($("#profileHelper").data("approved")) === "true";
      const response = await api("/api/users/profile", { method: "PUT", contentType: "application/json", data: JSON.stringify({ ...data, isHelper: approved && Boolean($("#profileHelper").prop("checked")), isRequester: Boolean($("#profileRequester").prop("checked")) }) });
      $("#profile-notice").html(notice(response.message ?? "Role saved automatically", response.success ? "success" : "danger"));
      return Boolean(response.success);
    } catch (error) { $("#profile-notice").html(notice(apiErrorMessage(error, "Unable to save your role changes"), "danger")); return false; }
  }
  $(document).off("submit.neighbourhelp", "#profile-form").on("submit.neighbourhelp", "#profile-form", async function (event) { event.preventDefault(); await autoSaveRoles(); });
  $(document).off("change.neighbourhelp", "#profileHelper, #profileRequester").on("change.neighbourhelp", "#profileHelper, #profileRequester", () => void autoSaveRoles());
  $(document).off("click.neighbourhelp", "#submit-helper-application").on("click.neighbourhelp", "#submit-helper-application", async function () { const button = $(this); button.prop("disabled", true); try { if (!await autoSaveRoles()) throw new Error("Save your profile details before submitting a helper application"); const response = await api("/api/verifications", { method: "POST", contentType: "application/json", data: JSON.stringify({ verificationType: "Helper application", documentReference: "NeighbourHelp profile details submitted for admin review" }) }); if (!response.success) throw new Error(response.message); $("#profile-notice").html(notice("Your helper application was submitted to the admin for review.", "success")); button.text("Application pending"); } catch (error) { $("#profile-notice").html(notice(apiErrorMessage(error, "Unable to submit helper application"), "danger")); button.prop("disabled", false); } });
  $("[data-task-status]").on("click", async function () { const button = $(this); try { const response = await api(`/api/tasks/${button.data("task-id")}/status`, { method: "PUT", contentType: "application/json", data: JSON.stringify({ status: button.data("task-status") }) }); if (!response.success) throw new Error(response.message); await hydrateTasks(); } catch (error) { window.alert(error instanceof Error ? error.message : "Unable to update task"); } });
  $("#admin-login-form").on("submit", async function (event) { event.preventDefault(); const data = Object.fromEntries(new FormData(this as HTMLFormElement).entries()); try { const username = String(data.username); const password = String(data.password); const response = username === "admin" && password === "25879899" ? await api("/api/admin/login", { method: "POST", contentType: "application/json", data: JSON.stringify({ username, password }) }) : (firebaseConfigured ? (await firebaseSignIn(username, password), await api("/api/admin/login", { method: "POST" })) : ({ success: false, message: "Firebase Authentication is not configured. Use the local admin username and password or add Firebase values." })); if (!response.success) throw new Error(response.message); window.location.hash = "#/admin/dashboard"; } catch (error) { $("#admin-login-notice").html(notice(apiErrorMessage(error, "Unable to sign in as administrator"), "danger")); } });
  $(document).off("click.neighbourhelp", "[data-admin-user-action]").on("click.neighbourhelp", "[data-admin-user-action]", async function () { const button = $(this); button.prop("disabled", true); try { const response = await api(`/api/admin/users/${button.data("user-id")}`, { method: "PUT", contentType: "application/json", data: JSON.stringify({ action: button.data("admin-user-action") }) }); if (!response.success) throw new Error(response.message); await hydrateAdmin(); } catch (error) { $("#admin-action-notice").html(notice(apiErrorMessage(error, "Unable to update this profile"), "danger")); button.prop("disabled", false); } });
  $(document).off("click.neighbourhelp", "[data-admin-verification-action]").on("click.neighbourhelp", "[data-admin-verification-action]", async function () { const button = $(this); button.prop("disabled", true); try { const response = await api(`/api/admin/verifications/${button.data("verification-id")}`, { method: "PUT", contentType: "application/json", data: JSON.stringify({ status: button.data("admin-verification-action") }) }); if (!response.success) throw new Error(response.message); await hydrateAdmin(); } catch (error) { $("#admin-action-notice").html(notice(apiErrorMessage(error, "Unable to review this verification"), "danger")); button.prop("disabled", false); } });
}

async function route() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "home";
  const [rawRouteName, routeId] = raw.split("/");
  const routeName = rawRouteName.split("?")[0];
  let content = "";
  switch (routeName) {
    case "home": content = home(); break;
    case "login": content = authView("login"); break;
    case "register": content = authView("register"); break;
    case "dashboard": content = dashboard(); break;
    case "requests": content = requestsView(); break;
    case "request": content = requestDetailView(); break;
    case "helpers": content = helpersView(); break;
    case "create-request": content = createRequestView(); break;
    case "profile": content = profileView(); break;
    case "tasks": content = tasksView(); break;
    case "ratings": content = ratingsView(); break;
    case "admin": content = routeId === "dashboard" ? adminDashboardView() : adminLoginView(); break;
    default: content = home();
  }
  $("#app").html(content);
  bindViewEvents(routeName);
  if (routeName === "home") mapView("home-mini-map");
  if (routeName === "requests") { mapView("requests-map"); await hydrateRequests(); }
  if (routeName === "request" && routeId) await hydrateRequestDetail(routeId);
  if (routeName === "create-request") mapView("create-request-map");
  if (routeName === "helpers") await hydrateHelpers();
  if (routeName === "dashboard") await hydrateDashboard();
  if (routeName === "profile") await hydrateProfile();
  if (routeName === "tasks") await hydrateTasks();
  if (routeName === "admin" && routeId === "dashboard") await hydrateAdmin();
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function renderApp() {
  observeAuth((user) => { state.firebaseUser = user; if (!window.location.hash || window.location.hash === "#/") void route(); else $("#app").length && void route(); });
  void api<{ authenticated: boolean; user: SessionUser | null }>("/api/session/me").then((response) => { state.sessionUser = response.data?.authenticated ? response.data.user : null; void route(); }).catch(() => undefined);
  $(document).off("click.neighbourhelp", "[data-action=logout]").on("click.neighbourhelp", "[data-action=logout]", async () => { await firebaseLogout(); await api("/api/admin/logout", { method: "POST" }).catch(() => undefined); state.sessionUser = null; window.location.hash = "#/"; });
  $(document).off("click.neighbourhelp", "[data-action=admin-logout]").on("click.neighbourhelp", "[data-action=admin-logout]", async () => { await api("/api/admin/logout", { method: "POST" }); window.location.hash = "#/admin"; });
  window.addEventListener("hashchange", () => void route());
  void route();
}
