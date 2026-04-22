const SUPABASE_URL = "https://pdmuwacdoodhcmkiufkc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbXV3YWNkb29kaGNta2l1ZmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MjM5NjAsImV4cCI6MjA5MjE5OTk2MH0.efOMCfzIpEgb-sPvsh-dhdrHfeiO4vkxuHokArhxFdk";
const STORAGE_BUCKET = "insurance-pdfs";
const APP_VERSION = "rest-v2";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function withTimeout(promise, ms, label){
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timerId);
  }
}

function getErrorMessage(error, fallback){
  if (!error) return fallback;
  return error.message || error.error_description || error.details || fallback;
}

function formatDate(dateString){
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function daysUntil(dateString){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function calculateVehicleStatus(endDate){
  return daysUntil(endDate) <= 60 ? "expiring" : "active";
}

function statusLabel(status){
  if (status === "expiring") return { text: "更新間近", className: "warn" };
  return { text: "有効", className: "ok" };
}

function buildPdfUrl(filePath){
  if (!filePath) return null;
  return supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

function sanitizeFileName(fileName){
  const lastDotIndex = fileName.lastIndexOf(".");
  const rawBase = lastDotIndex >= 0 ? fileName.slice(0, lastDotIndex) : fileName;
  const rawExt = lastDotIndex >= 0 ? fileName.slice(lastDotIndex).toLowerCase() : "";
  const normalizedBase = rawBase
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const safeBase = normalizedBase || "insurance-file";
  const safeExt = rawExt && /^[.a-z0-9]+$/.test(rawExt) ? rawExt : ".pdf";
  return `${safeBase}${safeExt}`;
}

async function restRequest(path, { method = "GET", token = null, body = null, contentType = "application/json", prefer = null } = {}){
  const headers = {
    apikey: SUPABASE_ANON_KEY
  };

  headers.Authorization = `Bearer ${token || SUPABASE_ANON_KEY}`;

  if (contentType){
    headers["Content-Type"] = contentType;
  }

  if (prefer){
    headers.Prefer = prefer;
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body instanceof Blob || body instanceof File ? body : body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok){
    const error = new Error(typeof data === "object" && data?.message ? data.message : text || `HTTP ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function loadFacilitiesAndVehicles(){
  const [facilities, vehicles] = await Promise.all([
    restRequest("/rest/v1/facilities?select=*&order=name.asc"),
    restRequest("/rest/v1/vehicles?select=*&order=plate_number.asc")
  ]);

  return (facilities || []).map((facility) => ({
    ...facility,
    vehicles: (vehicles || [])
      .filter((vehicle) => vehicle.facility_id === facility.id)
      .map((vehicle) => ({
        ...vehicle,
        status: calculateVehicleStatus(vehicle.insurance_end_date),
        pdfUrl: buildPdfUrl(vehicle.insurance_file_path)
      }))
  }));
}

function buildPortalPage(){
  const facilitySelect = document.querySelector("[data-facility-select]");
  const vehicleList = document.querySelector("[data-vehicle-list]");
  const detailHost = document.querySelector("[data-detail-host]");
  const resultsSection = document.querySelector("[data-results-section]");
  const summaryName = document.querySelector("[data-summary-name]");
  const summaryCount = document.querySelector("[data-summary-count]");

  if (!facilitySelect || !vehicleList || !detailHost) return;

  let facilities = [];
  let currentFacility = null;
  let currentVehicle = null;

  function renderVehicleDetail(){
    if (!currentVehicle){
      detailHost.innerHTML = `<div class="empty">車体を選択すると、自賠責保険情報とPDFプレビューがここに表示されます。</div>`;
      return;
    }

    const remaining = daysUntil(currentVehicle.insurance_end_date);
    const remainingLabel = remaining <= 60 ? `残り${remaining}日` : "期限に余裕あり";

    detailHost.innerHTML = `
      <div class="detail-body">
        <div class="detail-stats">
          <div class="detail-stat">
            <span>施設</span>
            <strong>${currentFacility.name}</strong>
          </div>
          <div class="detail-stat">
            <span>車体番号</span>
            <strong>${currentVehicle.plate_number}</strong>
          </div>
          <div class="detail-stat">
            <span>保険期限</span>
            <strong>${formatDate(currentVehicle.insurance_end_date)}</strong>
          </div>
        </div>

        <div class="pdf-shell">
          ${currentVehicle.pdfUrl ? `
            <iframe
              class="pdf-embed"
              src="${currentVehicle.pdfUrl}"
              title="${currentVehicle.plate_number} 自賠責保険PDF"
            ></iframe>
          ` : `
            <div class="pdf-page">
              <h4>${currentVehicle.plate_number}</h4>
              <p>${currentFacility.area || "エリア未設定"}</p>

              <div class="pdf-grid">
                <div class="pdf-item">
                  <span>Status</span>
                  <strong>${remainingLabel}</strong>
                </div>
                <div class="pdf-item">
                  <span>End Date</span>
                  <strong>${formatDate(currentVehicle.insurance_end_date)}</strong>
                </div>
                <div class="pdf-item">
                  <span>Facility</span>
                  <strong>${currentFacility.name}</strong>
                </div>
                <div class="pdf-item">
                  <span>Uploaded</span>
                  <strong>${formatDate(currentVehicle.created_at)}</strong>
                </div>
              </div>

              <div class="pdf-foot">
                自賠責保険PDFがまだ登録されていません。
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderVehicleList(){
    if (!currentFacility){
      vehicleList.innerHTML = "";
      return;
    }

    summaryName.textContent = currentFacility.name;
    summaryCount.textContent = `${currentFacility.vehicles.length}台`;

    vehicleList.innerHTML = currentFacility.vehicles
      .map((vehicle) => {
        const label = statusLabel(vehicle.status);
        const isActive = currentVehicle && currentVehicle.id === vehicle.id;
        return `
          <button class="vehicle-item ${isActive ? "is-active" : ""}" type="button" data-vehicle-id="${vehicle.id}">
            <div class="vehicle-top">
              <div>
                <p class="vehicle-code">${vehicle.plate_number}</p>
                <p class="vehicle-sub">${currentFacility.name}</p>
              </div>
              <span class="pill ${label.className}">${label.text}</span>
            </div>
            <div class="vehicle-meta">
              <span class="pill">期限 ${formatDate(vehicle.insurance_end_date)}</span>
              <span class="pill">${vehicle.insurance_file_path ? "PDF登録済み" : "PDF未登録"}</span>
            </div>
          </button>
        `;
      })
      .join("");

    vehicleList.querySelectorAll("[data-vehicle-id]").forEach((button) => {
      button.addEventListener("click", () => {
        currentVehicle = currentFacility.vehicles.find((vehicle) => vehicle.id === button.dataset.vehicleId);
        renderVehicleList();
        renderVehicleDetail();
      });
    });
  }

  function renderFacilityOptions(){
    facilitySelect.innerHTML = `<option value="">施設を選択してください</option>` +
      facilities.map((facility) => `<option value="${facility.id}">${facility.name}</option>`).join("");
  }

  facilitySelect.addEventListener("change", () => {
    if (!facilitySelect.value){
      currentFacility = null;
      currentVehicle = null;
      resultsSection.classList.add("hidden");
      renderVehicleList();
      renderVehicleDetail();
      return;
    }

    currentFacility = facilities.find((facility) => facility.id === facilitySelect.value) || null;
    currentVehicle = currentFacility?.vehicles[0] || null;
    resultsSection.classList.remove("hidden");
    renderVehicleList();
    renderVehicleDetail();
  });

  detailHost.innerHTML = `<div class="empty">施設を選択すると、登録されている車両と自賠責保険データが表示されます。</div>`;

  (async () => {
    try {
      facilities = await loadFacilitiesAndVehicles();
      renderFacilityOptions();
    } catch (error) {
      console.error(error);
      detailHost.innerHTML = `<div class="empty">データの読み込みに失敗しました。Supabase設定を確認してください。</div>`;
    }
  })();
}

function buildAdminPage(){
  const loginPanel = document.querySelector("[data-login-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginEmail = document.querySelector("[data-login-email]");
  const loginPassword = document.querySelector("[data-login-password]");
  const loginStatus = document.querySelector("[data-login-status]");
  const logoutButton = document.querySelector("[data-logout-button]");
  const secureArea = document.querySelector("[data-secure-area]");
  const facilityNameInput = document.querySelector("[data-facility-name-input]");
  const facilityAreaInput = document.querySelector("[data-facility-area-input]");
  const facilityManagerInput = document.querySelector("[data-facility-manager-input]");
  const addFacilityForm = document.querySelector("[data-add-facility-form]");
  const addFacilityButton = document.querySelector("[data-add-facility-button]");
  const facilityFormStatus = document.querySelector("[data-facility-form-status]");
  const vehicleFacilitySelect = document.querySelector("[data-admin-vehicle-facility]");
  const vehiclePlateInput = document.querySelector("[data-vehicle-plate-input]");
  const vehicleExpiryInput = document.querySelector("[data-vehicle-expiry-input]");
  const vehicleFileInput = document.querySelector("[data-vehicle-file-input]");
  const addVehicleForm = document.querySelector("[data-add-vehicle-form]");
  const addVehicleButton = document.querySelector("[data-add-vehicle-button]");
  const vehicleFormStatus = document.querySelector("[data-vehicle-form-status]");
  const currentPasswordInput = document.querySelector("[data-current-password-input]");
  const newPasswordInput = document.querySelector("[data-new-password-input]");
  const confirmPasswordInput = document.querySelector("[data-confirm-password-input]");
  const passwordUpdateButton = document.querySelector("[data-password-update-button]");
  const passwordStatus = document.querySelector("[data-password-status]");
  const debugStatus = document.querySelector("[data-debug-status]");
  const facilityTableBody = document.querySelector("[data-admin-facility-table]");
  const tableBody = document.querySelector("[data-admin-table]");
  const filterSelect = document.querySelector("[data-admin-filter]");
  const editModal = document.querySelector("[data-edit-modal]");
  const modalTitle = document.querySelector("[data-modal-title]");
  const modalSubtitle = document.querySelector("[data-modal-subtitle]");
  const modalCloseButtons = document.querySelectorAll("[data-modal-close]");
  const facilityEditForm = document.querySelector("[data-facility-edit-form]");
  const facilityEditName = document.querySelector("[data-edit-facility-name]");
  const facilityEditArea = document.querySelector("[data-edit-facility-area]");
  const facilityEditManager = document.querySelector("[data-edit-facility-manager]");
  const vehicleEditForm = document.querySelector("[data-vehicle-edit-form]");
  const vehicleEditFacility = document.querySelector("[data-edit-vehicle-facility]");
  const vehicleEditPlate = document.querySelector("[data-edit-vehicle-plate]");
  const vehicleEditExpiry = document.querySelector("[data-edit-vehicle-expiry]");
  const vehicleEditFileName = document.querySelector("[data-edit-vehicle-file-name]");
  const vehicleEditFile = document.querySelector("[data-edit-vehicle-file]");

  if (!secureArea || !loginForm) return;

  function setDebug(message){
    if (debugStatus){
      debugStatus.textContent = `debug(${APP_VERSION}): ${message}`;
    }
  }

  setDebug("admin init");

  let facilities = [];
  let session = null;
  let editingFacilityId = null;
  let editingVehicleRef = null;
  let isSubmittingFacility = false;
  let isSubmittingVehicle = false;

  function setFormStatus(element, message, tone = "neutral"){
    if (!element) return;
    element.textContent = message;
    element.style.color =
      tone === "success" ? "var(--success)" :
      tone === "error" ? "var(--warn)" :
      "var(--sub)";
  }

  function populateFacilityOptions(target){
    target.innerHTML = facilities
      .map((facility) => `<option value="${facility.id}">${facility.name}</option>`)
      .join("");
  }

  function closeModal(){
    editModal.classList.add("hidden");
    editingFacilityId = null;
    editingVehicleRef = null;
    facilityEditForm.reset();
    vehicleEditForm.reset();
  }

  function openModal(type){
    editModal.classList.remove("hidden");
    facilityEditForm.classList.toggle("hidden", type !== "facility");
    vehicleEditForm.classList.toggle("hidden", type !== "vehicle");
  }

  async function refreshData(selectedFacilityId){
    facilities = await loadFacilitiesAndVehicles();

    if (facilities.length === 0){
      facilityTableBody.innerHTML = "";
      tableBody.innerHTML = "";
      filterSelect.innerHTML = "";
      vehicleFacilitySelect.innerHTML = "";
      return;
    }

    populateFacilityOptions(vehicleFacilitySelect);
    populateFacilityOptions(filterSelect);

    const activeFacilityId = selectedFacilityId || filterSelect.value || facilities[0].id;
    filterSelect.value = activeFacilityId;
    vehicleFacilitySelect.value = activeFacilityId;

    renderFacilityTable();
    renderVehicleTable();
  }

  function upsertLocalFacility(facility){
    const existingIndex = facilities.findIndex((item) => item.id === facility.id);
    const normalized = {
      ...facility,
      vehicles: facility.vehicles || []
    };

    if (existingIndex >= 0){
      facilities[existingIndex] = normalized;
    } else {
      facilities.push(normalized);
    }
  }

  function appendLocalVehicle(facilityId, vehicle){
    const facility = facilities.find((item) => item.id === facilityId);
    if (!facility) return;
    facility.vehicles.push(vehicle);
    facility.vehicles.sort((a, b) => a.plate_number.localeCompare(b.plate_number, "ja"));
  }

  function renderFacilityTable(){
    facilityTableBody.innerHTML = facilities
      .map((facility) => `
        <tr>
          <td>${facility.name}</td>
          <td>${facility.area || "-"}</td>
          <td>${facility.vehicles.length}台</td>
          <td>
            <div class="action-row">
              <button class="btn-mini" type="button" data-edit-facility="${facility.id}">編集</button>
              <button class="btn-mini btn-danger" type="button" data-delete-facility="${facility.id}">削除</button>
            </div>
          </td>
        </tr>
      `)
      .join("");

    facilityTableBody.querySelectorAll("[data-edit-facility]").forEach((button) => {
      button.addEventListener("click", () => {
        const facility = facilities.find((item) => item.id === button.dataset.editFacility);
        editingFacilityId = facility.id;
        modalTitle.textContent = "施設を編集";
        modalSubtitle.textContent = "施設名・エリア・運用担当メモを編集できます。";
        facilityEditName.value = facility.name || "";
        facilityEditArea.value = facility.area || "";
        facilityEditManager.value = facility.manager_note || "";
        openModal("facility");
      });
    });

    facilityTableBody.querySelectorAll("[data-delete-facility]").forEach((button) => {
      button.addEventListener("click", async () => {
        const facility = facilities.find((item) => item.id === button.dataset.deleteFacility);
        const confirmed = window.confirm(`「${facility.name}」を削除します。登録車両も削除されます。`);
        if (!confirmed) return;

        const paths = facility.vehicles.map((vehicle) => vehicle.insurance_file_path).filter(Boolean);
        if (paths.length){
          await Promise.all(paths.map((path) =>
            restRequest(`/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
              method: "DELETE",
              token: session?.access_token,
              contentType: null
            })
          ));
        }

        try {
          await restRequest(`/rest/v1/facilities?id=eq.${facility.id}`, {
            method: "DELETE",
            token: session?.access_token,
            contentType: null
          });
        } catch (error) {
          window.alert("施設の削除に失敗しました。");
          return;
        }

        await refreshData(facilities[0]?.id);
      });
    });
  }

  function renderVehicleTable(){
    const facility = facilities.find((item) => item.id === filterSelect.value);
    if (!facility){
      tableBody.innerHTML = "";
      return;
    }

    tableBody.innerHTML = facility.vehicles
      .map((vehicle) => {
        const label = statusLabel(vehicle.status);
        return `
          <tr>
            <td>${facility.name}</td>
            <td>${vehicle.plate_number}</td>
            <td>${formatDate(vehicle.insurance_end_date)}</td>
            <td>${vehicle.insurance_file_path ? "登録済み" : "-"}</td>
            <td><span class="pill ${label.className}">${label.text}</span></td>
            <td>
              <div class="action-row">
                <button class="btn-mini" type="button" data-edit-vehicle="${facility.id}|${vehicle.id}">編集</button>
                <button class="btn-mini btn-danger" type="button" data-delete-vehicle="${facility.id}|${vehicle.id}">削除</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tableBody.querySelectorAll("[data-edit-vehicle]").forEach((button) => {
      button.addEventListener("click", () => {
        const [facilityId, vehicleId] = button.dataset.editVehicle.split("|");
        const facility = facilities.find((item) => item.id === facilityId);
        const vehicle = facility.vehicles.find((item) => item.id === vehicleId);
        editingVehicleRef = { facilityId, vehicleId };
        modalTitle.textContent = "車両を編集";
        modalSubtitle.textContent = "所属施設・ナンバー・有効期限・自賠責保険PDFを編集できます。";
        populateFacilityOptions(vehicleEditFacility);
        vehicleEditFacility.value = facilityId;
        vehicleEditPlate.value = vehicle.plate_number || "";
        vehicleEditExpiry.value = vehicle.insurance_end_date || "";
        vehicleEditFileName.value = vehicle.insurance_file_path ? vehicle.insurance_file_path.split("/").pop() : "未登録";
        openModal("vehicle");
      });
    });

    tableBody.querySelectorAll("[data-delete-vehicle]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [facilityId, vehicleId] = button.dataset.deleteVehicle.split("|");
        const facility = facilities.find((item) => item.id === facilityId);
        const vehicle = facility.vehicles.find((item) => item.id === vehicleId);
        const confirmed = window.confirm(`「${vehicle.plate_number}」を削除します。`);
        if (!confirmed) return;

        if (vehicle.insurance_file_path){
          await restRequest(`/storage/v1/object/${STORAGE_BUCKET}/${vehicle.insurance_file_path}`, {
            method: "DELETE",
            token: session?.access_token,
            contentType: null
          });
        }

        try {
          await restRequest(`/rest/v1/vehicles?id=eq.${vehicleId}`, {
            method: "DELETE",
            token: session?.access_token,
            contentType: null
          });
        } catch (error) {
          window.alert("車両の削除に失敗しました。");
          return;
        }

        await refreshData(facilityId);
      });
    });
  }

  async function uploadVehiclePdf(file, facilityId, vehicleId){
    const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const path = `${facilityId}/${vehicleId}/${safeName}`;
    await restRequest(`/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      token: session?.access_token,
      body: file,
      contentType: file.type || "application/pdf"
    });
    return path;
  }

  async function showAdmin(sessionData){
    session = sessionData;
    loginPanel.classList.add("hidden");
    secureArea.classList.remove("hidden");
    logoutButton.classList.remove("hidden");
    await refreshData();
  }

  async function showLogin(){
    session = null;
    loginPanel.classList.remove("hidden");
    secureArea.classList.add("hidden");
    logoutButton.classList.add("hidden");
  }

  modalCloseButtons.forEach((button) => button.addEventListener("click", closeModal));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    });

    if (error){
      loginStatus.textContent = `ログインに失敗しました: ${getErrorMessage(error, "メールアドレスまたはパスワードを確認してください。")}`;
      loginStatus.style.color = "var(--warn)";
      return;
    }

    loginStatus.textContent = "ログインしました。";
    loginStatus.style.color = "var(--success)";
    await showAdmin(data.session);
  });

  logoutButton.addEventListener("click", async () => {
    setDebug("logout clicked");
    await supabaseClient.auth.signOut();
    await showLogin();
  });

  filterSelect.addEventListener("change", renderVehicleTable);

  addFacilityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmittingFacility) return;
    isSubmittingFacility = true;
    addFacilityButton.disabled = true;
    addFacilityButton.textContent = "登録中...";
    setFormStatus(facilityFormStatus, "施設を登録しています...", "neutral");
    setDebug("facility submit");
    const payload = {
      name: facilityNameInput.value.trim(),
      area: facilityAreaInput.value.trim() || null,
      manager_note: facilityManagerInput.value.trim() || null
    };

    if (!payload.name){
      setDebug("facility validation failed");
      setFormStatus(facilityFormStatus, "施設名を入力してください。", "error");
      isSubmittingFacility = false;
      addFacilityButton.disabled = false;
      addFacilityButton.textContent = "施設を登録";
      window.alert("施設名を入力してください。");
      return;
    }

    setDebug("facility insert start");
    try {
      const result = await withTimeout(
        restRequest("/rest/v1/facilities?select=*", {
          method: "POST",
          token: session?.access_token,
          body: payload,
          prefer: "return=representation"
        }),
        12000,
        "facility insert"
      );
      const data = Array.isArray(result) ? result[0] : result;
      facilityNameInput.value = "";
      facilityAreaInput.value = "";
      facilityManagerInput.value = "";
      setDebug("facility insert success");
      setFormStatus(facilityFormStatus, "施設を登録しました。", "success");
      upsertLocalFacility({ ...data, vehicles: [] });
      populateFacilityOptions(vehicleFacilitySelect);
      populateFacilityOptions(filterSelect);
      filterSelect.value = data.id;
      vehicleFacilitySelect.value = data.id;
      renderFacilityTable();
      renderVehicleTable();
      window.alert("施設を登録しました。");
      refreshData(data.id).catch((error) => {
        console.error(error);
        setDebug(`facility refresh warning: ${getErrorMessage(error, "unknown")}`);
      });
    } catch (requestError) {
      console.error(requestError);
      setDebug(`facility insert request failed: ${getErrorMessage(requestError, "unknown")}`);
      setFormStatus(facilityFormStatus, getErrorMessage(requestError, "施設の登録に失敗しました。"), "error");
      window.alert(`施設の登録リクエストに失敗しました。\n${getErrorMessage(requestError, "通信またはSupabase設定を確認してください。")}`);
      return;
    } finally {
      isSubmittingFacility = false;
      addFacilityButton.disabled = false;
      addFacilityButton.textContent = "施設を登録";
    }
  });

  addVehicleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmittingVehicle) return;
    isSubmittingVehicle = true;
    addVehicleButton.disabled = true;
    addVehicleButton.textContent = "登録中...";
    setFormStatus(vehicleFormStatus, "車両を登録しています...", "neutral");
    setDebug("vehicle submit");
    const facilityId = vehicleFacilitySelect.value;
    const plateNumber = vehiclePlateInput.value.trim();
    const insuranceEndDate = vehicleExpiryInput.value;
    const file = vehicleFileInput.files[0];

    if (!facilityId || !plateNumber || !insuranceEndDate || !file){
      setDebug("vehicle validation failed");
      setFormStatus(vehicleFormStatus, "施設・ナンバー・有効期限・PDFを入力してください。", "error");
      isSubmittingVehicle = false;
      addVehicleButton.disabled = false;
      addVehicleButton.textContent = "車両を登録";
      window.alert("施設・ナンバー・有効期限・自賠責保険PDFを入力してください。");
      return;
    }

    setDebug("vehicle insert start");
    try {
      const result = await withTimeout(
        restRequest("/rest/v1/vehicles?select=*", {
          method: "POST",
          token: session?.access_token,
          body: {
            facility_id: facilityId,
            plate_number: plateNumber,
            insurance_end_date: insuranceEndDate
          },
          prefer: "return=representation"
        }),
        12000,
        "vehicle insert"
      );
      const insertedVehicle = Array.isArray(result) ? result[0] : result;
      let insuranceFilePath = null;

      try {
        insuranceFilePath = await uploadVehiclePdf(file, facilityId, insertedVehicle.id);
        await restRequest(`/rest/v1/vehicles?id=eq.${insertedVehicle.id}`, {
          method: "PATCH",
          token: session?.access_token,
          body: { insurance_file_path: insuranceFilePath }
        });
      } catch (error) {
        console.error(error);
        setDebug(`vehicle upload error: ${getErrorMessage(error, "unknown")}`);
        await restRequest(`/rest/v1/vehicles?id=eq.${insertedVehicle.id}`, {
          method: "DELETE",
          token: session?.access_token,
          contentType: null
        }).catch(() => {});
        window.alert(`PDFアップロードに失敗しました。\n${getErrorMessage(error, "Storage設定を確認してください。")}`);
        return;
      }

      const localVehicle = {
        ...insertedVehicle,
        insurance_file_path: insuranceFilePath,
        insurance_end_date: insuranceEndDate,
        plate_number: plateNumber,
        status: calculateVehicleStatus(insuranceEndDate)
      };

      localVehicle.pdfUrl = buildPdfUrl(localVehicle.insurance_file_path);
      vehiclePlateInput.value = "";
      vehicleExpiryInput.value = "";
      vehicleFileInput.value = "";
      setDebug("vehicle insert success");
      setFormStatus(vehicleFormStatus, "車両を登録しました。", "success");
      appendLocalVehicle(facilityId, localVehicle);
      filterSelect.value = facilityId;
      renderFacilityTable();
      renderVehicleTable();
      window.alert("車両を登録しました。");
      refreshData(facilityId).catch((error) => {
        console.error(error);
        setDebug(`vehicle refresh warning: ${getErrorMessage(error, "unknown")}`);
      });
    } catch (requestError) {
      console.error(requestError);
      setDebug(`vehicle insert request failed: ${getErrorMessage(requestError, "unknown")}`);
      const message = getErrorMessage(requestError, "通信またはSupabase設定を確認してください。");
      if (String(message).includes("vehicles_plate_number_key")){
        setFormStatus(vehicleFormStatus, "同じナンバーの車両がすでに登録されています。", "error");
        window.alert("同じナンバーの車両がすでに登録されています。登録済み車両の編集から更新してください。");
      } else {
        setFormStatus(vehicleFormStatus, message, "error");
        window.alert(`車両登録リクエストに失敗しました。\n${message}`);
      }
      return;
    } finally {
      isSubmittingVehicle = false;
      addVehicleButton.disabled = false;
      addVehicleButton.textContent = "車両を登録";
    }
  });

  facilityEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: facilityEditName.value.trim(),
      area: facilityEditArea.value.trim() || null,
      manager_note: facilityEditManager.value.trim() || null
    };

    try {
      await restRequest(`/rest/v1/facilities?id=eq.${editingFacilityId}`, {
        method: "PATCH",
        token: session?.access_token,
        body: payload
      });
    } catch (error) {
      window.alert(`施設の更新に失敗しました。\n${getErrorMessage(error, "Supabaseの設定を確認してください。")}`);
      return;
    }

    await refreshData(editingFacilityId);
    closeModal();
  });

  vehicleEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingVehicleRef) return;

    const sourceFacility = facilities.find((facility) => facility.id === editingVehicleRef.facilityId);
    const vehicle = sourceFacility.vehicles.find((item) => item.id === editingVehicleRef.vehicleId);
    const nextFacilityId = vehicleEditFacility.value;
    const payload = {
      facility_id: nextFacilityId,
      plate_number: vehicleEditPlate.value.trim(),
      insurance_end_date: vehicleEditExpiry.value
    };

    let nextFilePath = vehicle.insurance_file_path || null;
    const replacementFile = vehicleEditFile.files[0];

    if (replacementFile){
      try {
        if (nextFilePath){
          await restRequest(`/storage/v1/object/${STORAGE_BUCKET}/${nextFilePath}`, {
            method: "DELETE",
            token: session?.access_token,
            contentType: null
          });
        }
        nextFilePath = await uploadVehiclePdf(replacementFile, nextFacilityId, vehicle.id);
        payload.insurance_file_path = nextFilePath;
      } catch (error) {
        console.error(error);
        window.alert("PDFの差し替えに失敗しました。");
        return;
      }
    }

    try {
      await restRequest(`/rest/v1/vehicles?id=eq.${vehicle.id}`, {
        method: "PATCH",
        token: session?.access_token,
        body: payload
      });
    } catch (error) {
      window.alert(`車両の更新に失敗しました。\n${getErrorMessage(error, "Supabaseの設定を確認してください。")}`);
      return;
    }

    await refreshData(nextFacilityId);
    closeModal();
  });

  passwordUpdateButton.addEventListener("click", async () => {
    if (!session?.user?.email){
      passwordStatus.textContent = "ログイン状態を確認してください。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    if (!currentPasswordInput.value){
      passwordStatus.textContent = "現在のパスワードを入力してください。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    if (!newPasswordInput.value || newPasswordInput.value !== confirmPasswordInput.value){
      passwordStatus.textContent = "新しいパスワードと確認用パスワードを一致させてください。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
      email: session.user.email,
      password: currentPasswordInput.value
    });

    if (verifyError){
      passwordStatus.textContent = "現在のパスワードが違います。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPasswordInput.value });
    if (error){
      passwordStatus.textContent = "パスワード更新に失敗しました。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    passwordStatus.textContent = "パスワードを更新しました。";
    passwordStatus.style.color = "var(--success)";
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
  });

  (async () => {
    setDebug("session check");
    const { data } = await supabaseClient.auth.getSession();
    if (data.session){
      setDebug("session found");
      await showAdmin(data.session);
    } else {
      setDebug("no session");
      await showLogin();
    }
  })();

  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    if (nextSession){
      await showAdmin(nextSession);
    } else {
      await showLogin();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildPortalPage();
  buildAdminPage();
});
