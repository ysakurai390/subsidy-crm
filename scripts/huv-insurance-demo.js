const defaultDemoData = {
  facilities: [
    {
      id: "beppu-station",
      name: "別府駅前",
      area: "別府市駅前本町",
      manager: "観光案内所連携",
      vehicles: [
        {
          id: "be-101",
          plate: "大分市 101",
          model: "glafit NFR-01 Pro",
          status: "active",
          insuranceNumber: "HUV-BE-2026-041",
          startDate: "2026-04-01",
          endDate: "2027-03-31",
          uploadedAt: "2026-04-05",
          note: "改定版PDFを反映済み。"
        },
        {
          id: "be-204",
          plate: "大分市 204",
          model: "glafit NFR-01 Pro",
          status: "expiring",
          insuranceNumber: "HUV-BE-2026-052",
          startDate: "2025-05-01",
          endDate: "2026-05-31",
          uploadedAt: "2025-06-03",
          note: "更新期限が近いため差し替え予定。"
        },
        {
          id: "be-317",
          plate: "大分市 317",
          model: "YADEA S-01",
          status: "active",
          insuranceNumber: "HUV-BE-2026-067",
          startDate: "2026-02-14",
          endDate: "2027-02-13",
          uploadedAt: "2026-02-16",
          note: "現行契約書を格納。"
        }
      ]
    },
    {
      id: "suginoi",
      name: "杉乃井ホテル",
      area: "別府市観海寺",
      manager: "ホテル受付カウンター",
      vehicles: [
        {
          id: "su-118",
          plate: "別府市 118",
          model: "glafit NFR-01 Lite",
          status: "active",
          insuranceNumber: "HUV-SU-2026-014",
          startDate: "2026-01-10",
          endDate: "2027-01-09",
          uploadedAt: "2026-01-11",
          note: "ホテル稼働車両。"
        },
        {
          id: "su-122",
          plate: "別府市 122",
          model: "glafit NFR-01 Lite",
          status: "active",
          insuranceNumber: "HUV-SU-2026-018",
          startDate: "2026-01-10",
          endDate: "2027-01-09",
          uploadedAt: "2026-01-11",
          note: "夜間貸出対象。"
        }
      ]
    },
    {
      id: "harbors",
      name: "北浜港エリア",
      area: "別府市北浜",
      manager: "HUV運営チーム",
      vehicles: [
        {
          id: "ha-031",
          plate: "別府市 031",
          model: "YADEA S-01",
          status: "active",
          insuranceNumber: "HUV-HA-2026-021",
          startDate: "2026-03-01",
          endDate: "2027-02-28",
          uploadedAt: "2026-03-02",
          note: "港湾エリア用。"
        }
      ]
    }
  ]
};

const ADMIN_PASSWORD_KEY = "huvAdminPassword";
const ADMIN_AUTH_KEY = "huvAdminAuthenticated";
const DATA_STORAGE_KEY = "huvInsuranceDemoData";
const PDF_DB_NAME = "huvInsurancePdfDb";
const PDF_STORE_NAME = "vehiclePdfs";

const demoData = loadDemoData();
const pdfUrlCache = new Map();

function loadDemoData(){
  try {
    const saved = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (saved){
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Failed to load demo data", error);
  }

  return JSON.parse(JSON.stringify(defaultDemoData));
}

function saveDemoData(){
  const sanitized = {
    facilities: demoData.facilities.map((facility) => ({
      ...facility,
      vehicles: facility.vehicles.map((vehicle) => {
        const { fileDataUrl, ...rest } = vehicle;
        return rest;
      })
    }))
  };

  window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(sanitized));
}

function getAdminPassword(){
  return window.localStorage.getItem(ADMIN_PASSWORD_KEY) || "nanoact0607";
}

function setAdminAuthenticated(value){
  if (value){
    window.sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
  } else {
    window.sessionStorage.removeItem(ADMIN_AUTH_KEY);
  }
}

function isAdminAuthenticated(){
  return window.sessionStorage.getItem(ADMIN_AUTH_KEY) === "true";
}

function formatDate(dateString){
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

function statusLabel(status){
  if (status === "expiring") return { text: "更新間近", className: "warn" };
  return { text: "有効", className: "ok" };
}

function calculateVehicleStatus(endDate){
  return daysUntil(endDate) <= 60 ? "expiring" : "active";
}

function getFacilityById(id){
  return demoData.facilities.find((facility) => facility.id === id) || demoData.facilities[0];
}

function openPdfDb(){
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PDF_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)){
        db.createObjectStore(PDF_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveVehiclePdf(vehicleId, file){
  const db = await openPdfDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PDF_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PDF_STORE_NAME);
    const request = store.put(file, vehicleId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadVehiclePdfUrl(vehicleId){
  if (pdfUrlCache.has(vehicleId)){
    return pdfUrlCache.get(vehicleId);
  }

  const db = await openPdfDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PDF_STORE_NAME, "readonly");
    const store = transaction.objectStore(PDF_STORE_NAME);
    const request = store.get(vehicleId);

    request.onsuccess = () => {
      const file = request.result;
      if (!file){
        resolve(null);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      pdfUrlCache.set(vehicleId, objectUrl);
      resolve(objectUrl);
    };

    request.onerror = () => reject(request.error);
  });
}

async function deleteVehiclePdf(vehicleId){
  if (pdfUrlCache.has(vehicleId)){
    URL.revokeObjectURL(pdfUrlCache.get(vehicleId));
    pdfUrlCache.delete(vehicleId);
  }

  const db = await openPdfDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PDF_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PDF_STORE_NAME);
    const request = store.delete(vehicleId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildPortalPage(){
  const facilitySelect = document.querySelector("[data-facility-select]");
  const vehicleList = document.querySelector("[data-vehicle-list]");
  const detailHost = document.querySelector("[data-detail-host]");
  const resultsSection = document.querySelector("[data-results-section]");
  const summaryName = document.querySelector("[data-summary-name]");
  const summaryCount = document.querySelector("[data-summary-count]");
  const adminLink = document.querySelector("[data-admin-link]");

  if (!facilitySelect || !vehicleList || !detailHost) return;

  facilitySelect.innerHTML = demoData.facilities
    .map((facility, index) => {
      if (index === 0){
        return `<option value="" selected>施設を選択してください</option>` +
          demoData.facilities.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
      }
      return "";
    })
    .join("");

  let currentFacility = null;
  let currentVehicle = null;
  let detailRenderToken = 0;

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
                <p class="vehicle-code">${vehicle.plate}</p>
                <p class="vehicle-sub">${vehicle.model}</p>
              </div>
              <span class="pill ${label.className}">${label.text}</span>
            </div>
            <div class="vehicle-meta">
              <span class="pill">設置施設 ${currentFacility.name}</span>
              <span class="pill">期限 ${formatDate(vehicle.endDate)}</span>
            </div>
          </button>
        `;
      })
      .join("");

    vehicleList.querySelectorAll("[data-vehicle-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        currentVehicle = currentFacility.vehicles.find((vehicle) => vehicle.id === button.dataset.vehicleId);
        renderVehicleList();
        await renderVehicleDetail();
      });
    });
  }

  async function renderVehicleDetail(){
    if (!currentVehicle){
      detailHost.innerHTML = `<div class="empty">車体を選択すると、自賠責保険情報とPDFプレビューがここに表示されます。</div>`;
      return;
    }

    const renderToken = ++detailRenderToken;
    const remaining = daysUntil(currentVehicle.endDate);
    const remainingLabel = remaining <= 60 ? `残り${remaining}日` : "期限に余裕あり";
    let pdfUrl = currentVehicle.fileDataUrl || null;

    if (!pdfUrl){
      try {
        pdfUrl = await loadVehiclePdfUrl(currentVehicle.id);
      } catch (error) {
        console.error("Failed to load vehicle PDF", error);
      }
    }

    if (renderToken !== detailRenderToken){
      return;
    }

    detailHost.innerHTML = `
      <div class="detail-body">
        <div class="detail-stats">
          <div class="detail-stat">
            <span>施設</span>
            <strong>${currentFacility.name}</strong>
          </div>
          <div class="detail-stat">
            <span>車体番号</span>
            <strong>${currentVehicle.plate}</strong>
          </div>
          <div class="detail-stat">
            <span>保険期限</span>
            <strong>${formatDate(currentVehicle.endDate)}</strong>
          </div>
        </div>

        <div class="pdf-shell">
          ${pdfUrl ? `
            <iframe
              class="pdf-embed"
              src="${pdfUrl}"
              title="${currentVehicle.plate} 自賠責保険PDF"
            ></iframe>
          ` : `
            <div class="pdf-page">
              <h4>${currentVehicle.plate}</h4>
              <p>${currentVehicle.model} / ${currentFacility.area}</p>

              <div class="pdf-grid">
                <div class="pdf-item">
                  <span>Insurance No.</span>
                  <strong>${currentVehicle.insuranceNumber}</strong>
                </div>
                <div class="pdf-item">
                  <span>Status</span>
                  <strong>${remainingLabel}</strong>
                </div>
                <div class="pdf-item">
                  <span>End Date</span>
                  <strong>${formatDate(currentVehicle.endDate)}</strong>
                </div>
                <div class="pdf-item">
                  <span>Facility</span>
                  <strong>${currentFacility.name}</strong>
                </div>
                <div class="pdf-item">
                  <span>Uploaded</span>
                  <strong>${formatDate(currentVehicle.uploadedAt)}</strong>
                </div>
              </div>

              <div class="pdf-foot">
                <strong>備考:</strong> ${currentVehicle.note}
                <br />
                この画面はHTMLモックです。後続実装でSupabase StorageのPDFを埋め込み表示する想定です。
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  facilitySelect.addEventListener("change", async () => {
    if (!facilitySelect.value){
      currentFacility = null;
      currentVehicle = null;
      resultsSection.classList.add("hidden");
      renderVehicleList();
      await renderVehicleDetail();
      return;
    }

    currentFacility = getFacilityById(facilitySelect.value);
    currentVehicle = currentFacility.vehicles[0] || null;
    resultsSection.classList.remove("hidden");
    renderVehicleList();
    await renderVehicleDetail();
  });

  if (adminLink){
    adminLink.addEventListener("click", (event) => {
      const password = window.prompt("管理者パスワードを入力してください");
      if (password !== getAdminPassword()){
        event.preventDefault();
        setAdminAuthenticated(false);
        if (password !== null){
          window.alert("パスワードが違います。");
        }
      } else {
        setAdminAuthenticated(true);
      }
    });
  }

  detailHost.innerHTML = `<div class="empty">施設を選択すると、登録されている車両と自賠責保険データが表示されます。</div>`;
}

function buildAdminPage(){
  const secureArea = document.querySelector("[data-secure-area]");
  const vehicleFacilitySelect = document.querySelector("[data-admin-vehicle-facility]");
  const tableBody = document.querySelector("[data-admin-table]");
  const facilityTableBody = document.querySelector("[data-admin-facility-table]");
  const filterSelect = document.querySelector("[data-admin-filter]");
  const facilityNameInput = document.querySelector("[data-facility-name-input]");
  const facilityAreaInput = document.querySelector("[data-facility-area-input]");
  const facilityManagerInput = document.querySelector("[data-facility-manager-input]");
  const addFacilityButton = document.querySelector("[data-add-facility-button]");
  const vehiclePlateInput = document.querySelector("[data-vehicle-plate-input]");
  const vehicleExpiryInput = document.querySelector("[data-vehicle-expiry-input]");
  const vehicleFileInput = document.querySelector("[data-vehicle-file-input]");
  const addVehicleButton = document.querySelector("[data-add-vehicle-button]");
  const currentPasswordInput = document.querySelector("[data-current-password-input]");
  const newPasswordInput = document.querySelector("[data-new-password-input]");
  const confirmPasswordInput = document.querySelector("[data-confirm-password-input]");
  const passwordUpdateButton = document.querySelector("[data-password-update-button]");
  const passwordStatus = document.querySelector("[data-password-status]");
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
  let editingFacilityId = null;
  let editingVehicleRef = null;

  if (!secureArea || !vehicleFacilitySelect || !tableBody || !filterSelect || !facilityTableBody) return;

  if (!isAdminAuthenticated()){
    const password = window.prompt("管理者パスワードを入力してください");
    if (password !== getAdminPassword()){
      window.alert("パスワードが違います。");
      window.location.href = "./huv_insurance_portal.html";
      return;
    }
    setAdminAuthenticated(true);
  }

  function populateFacilityOptions(target){
    target.innerHTML = demoData.facilities
      .map((facility) => `<option value="${facility.id}">${facility.name}</option>`)
      .join("");
  }

  function openModal(type){
    editModal.classList.remove("hidden");
    facilityEditForm.classList.toggle("hidden", type !== "facility");
    vehicleEditForm.classList.toggle("hidden", type !== "vehicle");
  }

  function closeModal(){
    editModal.classList.add("hidden");
    editingFacilityId = null;
    editingVehicleRef = null;
    facilityEditForm.reset();
    vehicleEditForm.reset();
  }

  modalCloseButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  function renderFacilityTable(){
    facilityTableBody.innerHTML = demoData.facilities
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
        const facility = getFacilityById(button.dataset.editFacility);
        editingFacilityId = facility.id;
        modalTitle.textContent = "施設を編集";
        modalSubtitle.textContent = "施設名・エリア・運用担当メモを編集できます。";
        facilityEditName.value = facility.name || "";
        facilityEditArea.value = facility.area || "";
        facilityEditManager.value = facility.manager || "";
        openModal("facility");
      });
    });

    facilityTableBody.querySelectorAll("[data-delete-facility]").forEach((button) => {
      button.addEventListener("click", () => {
        const facility = getFacilityById(button.dataset.deleteFacility);
        const confirmed = window.confirm(`「${facility.name}」を削除します。登録車両も削除されます。`);
        if (!confirmed) return;
        demoData.facilities.splice(demoData.facilities.findIndex((item) => item.id === facility.id), 1);
        saveDemoData();
        refreshAdminOptions(demoData.facilities[0]?.id);
      });
    });
  }

  function renderTable(){
    const facility = getFacilityById(filterSelect.value);
    if (!facility){
      tableBody.innerHTML = "";
      return;
    }

    tableBody.innerHTML = facility.vehicles
      .map((vehicle) => {
        vehicle.status = calculateVehicleStatus(vehicle.endDate);
        const label = statusLabel(vehicle.status);
        return `
          <tr>
            <td>${facility.name}</td>
            <td>${vehicle.plate}</td>
            <td>${formatDate(vehicle.endDate)}</td>
            <td>${vehicle.fileName || "-"}</td>
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
        const facility = getFacilityById(facilityId);
        const vehicle = facility.vehicles.find((item) => item.id === vehicleId);
        editingVehicleRef = { facilityId, vehicleId };
        modalTitle.textContent = "車両を編集";
        modalSubtitle.textContent = "所属施設・ナンバー・有効期限・自賠責保険PDFを編集できます。";
        populateFacilityOptions(vehicleEditFacility);
        vehicleEditFacility.value = facilityId;
        vehicleEditPlate.value = vehicle.plate || "";
        vehicleEditExpiry.value = vehicle.endDate || "";
        vehicleEditFileName.value = vehicle.fileName || "未登録";
        openModal("vehicle");
      });
    });

    tableBody.querySelectorAll("[data-delete-vehicle]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [facilityId, vehicleId] = button.dataset.deleteVehicle.split("|");
        const facility = getFacilityById(facilityId);
        const vehicle = facility.vehicles.find((item) => item.id === vehicleId);
        const confirmed = window.confirm(`「${vehicle.plate}」を削除します。`);
        if (!confirmed) return;
        facility.vehicles.splice(facility.vehicles.findIndex((item) => item.id === vehicleId), 1);
        try {
          await deleteVehiclePdf(vehicleId);
        } catch (error) {
          console.error("Failed to delete vehicle PDF", error);
        }
        saveDemoData();
        renderTable();
        renderFacilityTable();
      });
    });
  }

  function refreshAdminOptions(selectedFacilityId){
    if (demoData.facilities.length === 0){
      vehicleFacilitySelect.innerHTML = "";
      filterSelect.innerHTML = "";
      tableBody.innerHTML = "";
      facilityTableBody.innerHTML = "";
      return;
    }

    populateFacilityOptions(vehicleFacilitySelect);
    populateFacilityOptions(filterSelect);

    if (selectedFacilityId){
      vehicleFacilitySelect.value = selectedFacilityId;
      filterSelect.value = selectedFacilityId;
    }

    renderFacilityTable();
    renderTable();
  }

  function createFacilityId(name){
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]+/gu, "")
      .slice(0, 24) || `facility-${Date.now()}`;
  }

  secureArea.classList.remove("hidden");
  refreshAdminOptions(demoData.facilities[0]?.id);

  filterSelect.addEventListener("change", renderTable);

  facilityEditForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const facility = getFacilityById(editingFacilityId);
    if (!facility) return;
    facility.name = facilityEditName.value.trim() || facility.name;
    facility.area = facilityEditArea.value.trim() || "";
    facility.manager = facilityEditManager.value.trim() || "";
    saveDemoData();
    refreshAdminOptions(facility.id);
    closeModal();
  });

  vehicleEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingVehicleRef) return;
    const sourceFacility = getFacilityById(editingVehicleRef.facilityId);
    const vehicleIndex = sourceFacility.vehicles.findIndex((item) => item.id === editingVehicleRef.vehicleId);
    if (vehicleIndex < 0) return;
    const vehicle = sourceFacility.vehicles[vehicleIndex];
    const targetFacilityId = vehicleEditFacility.value;
    const targetFacility = getFacilityById(targetFacilityId);

    vehicle.plate = vehicleEditPlate.value.trim() || vehicle.plate;
    vehicle.endDate = vehicleEditExpiry.value || vehicle.endDate;
    vehicle.status = calculateVehicleStatus(vehicle.endDate);

    const replacementFile = vehicleEditFile.files[0];
    if (replacementFile){
      try {
        vehicle.fileDataUrl = await readFileAsDataUrl(replacementFile);
        vehicle.fileName = replacementFile.name;
        await saveVehiclePdf(vehicle.id, replacementFile);
      } catch (error) {
        console.error(error);
        window.alert("PDFの差し替えに失敗しました。");
        return;
      }
    }

    if (targetFacilityId !== sourceFacility.id){
      sourceFacility.vehicles.splice(vehicleIndex, 1);
      targetFacility.vehicles.push(vehicle);
    }

    saveDemoData();
    refreshAdminOptions(targetFacilityId);
    closeModal();
  });

  addFacilityButton.addEventListener("click", () => {
    const name = facilityNameInput.value.trim();
    const area = facilityAreaInput.value.trim();
    const manager = facilityManagerInput.value.trim();

    if (!name){
      window.alert("施設名を入力してください。");
      return;
    }

    const newFacility = {
      id: createFacilityId(name),
      name,
      area: area || "未設定",
      manager: manager || "未設定",
      vehicles: []
    };

    demoData.facilities.push(newFacility);
    saveDemoData();
    refreshAdminOptions(newFacility.id);
    facilityNameInput.value = "";
    facilityAreaInput.value = "";
    facilityManagerInput.value = "";
    window.alert("施設を追加しました。");
  });

  addVehicleButton.addEventListener("click", async () => {
    const facility = getFacilityById(vehicleFacilitySelect.value);
    const plate = vehiclePlateInput.value.trim();
    const endDate = vehicleExpiryInput.value;
    const file = vehicleFileInput.files[0];

    if (!plate || !endDate || !file){
      window.alert("ナンバー・有効期限・自賠責保険PDFを入力してください。");
      return;
    }

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const vehicleId = `vehicle-${Date.now()}`;
      await saveVehiclePdf(vehicleId, file);

      facility.vehicles.push({
        id: vehicleId,
        plate,
        model: "登録車両",
        status: calculateVehicleStatus(endDate),
        insuranceNumber: `HUV-${Date.now()}`,
        startDate: new Date().toISOString().slice(0, 10),
        endDate,
        uploadedAt: new Date().toISOString().slice(0, 10),
        note: "管理者ページから追加された車両です。",
        fileName: file.name,
        fileDataUrl
      });
    } catch (error) {
      console.error(error);
      window.alert("PDFの読み込みまたは保存に失敗しました。");
      return;
    }

    saveDemoData();
    vehiclePlateInput.value = "";
    vehicleExpiryInput.value = "";
    vehicleFileInput.value = "";
    refreshAdminOptions(facility.id);
    window.alert("車両を追加しました。");
  });

  passwordUpdateButton.addEventListener("click", () => {
    const currentPassword = currentPasswordInput.value;
    const nextPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (currentPassword !== getAdminPassword()){
      passwordStatus.textContent = "現在のパスワードが違います。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    if (!nextPassword){
      passwordStatus.textContent = "新しいパスワードを入力してください。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    if (nextPassword !== confirmPassword){
      passwordStatus.textContent = "新しいパスワードと確認用パスワードが一致しません。";
      passwordStatus.style.color = "var(--warn)";
      return;
    }

    window.localStorage.setItem(ADMIN_PASSWORD_KEY, nextPassword);
    passwordStatus.textContent = "パスワードを更新しました。次回以降は新しいパスワードで管理者ページへ入れます。";
    passwordStatus.style.color = "var(--success)";
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildPortalPage();
  buildAdminPage();
});
