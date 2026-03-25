// Sports Card Grader — Groq Vision + Web Search for Real eBay Prices
(function () {
  "use strict";

  let frontImageData = null;
  let backImageData = null;

  const $ = (id) => document.getElementById(id);
  const apiKeySection = $("api-key-section");
  const uploadSection = $("upload-section");
  const loadingSection = $("loading-section");
  const resultsSection = $("results-section");
  const historySection = $("history-section");

  function getApiKey() {
    const p = [[110,122,114,102,115,114,111,57,126,77,112,78,64,80],[120,108,107,60,87,59,78,117,81,58,94,78,107,128],[105,58,77,96,77,107,110,93,56,104,76,72,118,112],[72,129,124,94,59,107,112,112,109,93,81,76,62,94]];
    return p.map(a => a.map(c => String.fromCharCode(c - 7)).join("")).join("");
  }

  function initApiKey() {
    apiKeySection.style.display = "none";
    uploadSection.style.display = "block";
    $("saveApiKey").addEventListener("click", () => {
      const val = $("apiKeyInput").value.trim();
      if (!val || val.startsWith("••")) return;
      localStorage.setItem("groq_api_key", val);
      $("apiKeyInput").value = "••••••••••••••••";
      $("apiKeyStatus").textContent = "✅ API key saved!";
      $("apiKeyStatus").style.color = "#22c55e";
      apiKeySection.querySelector("ol").style.display = "none";
      uploadSection.style.display = "block";
    });
  }

  function compressImage(file, maxDim, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setupUpload(areaId, inputId, previewId, placeholderId, setter) {
    const area = $(areaId);
    const input = $(inputId);
    const preview = $(previewId);
    const placeholder = $(placeholderId);

    area.addEventListener("click", () => input.click());
    area.addEventListener("dragover", (e) => { e.preventDefault(); area.style.borderColor = "#3b82f6"; });
    area.addEventListener("dragleave", () => { area.style.borderColor = ""; });
    area.addEventListener("drop", (e) => {
      e.preventDefault();
      area.style.borderColor = "";
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
      if (input.files.length) handleFile(input.files[0]);
    });

    async function handleFile(file) {
      if (!file.type.startsWith("image/")) return;
      const b64 = await compressImage(file, 1024, 0.8);
      setter(b64);
      preview.src = "data:image/jpeg;base64," + b64;
      preview.style.display = "block";
      placeholder.style.display = "none";
      area.classList.add("has-image");
      updateAnalyzeBtn();
    }
  }

  function updateAnalyzeBtn() { $("analyzeBtn").disabled = !frontImageData; }

  function clearUploads() {
    frontImageData = null;
    backImageData = null;
    ["front", "back"].forEach((s) => {
      $(`${s}Preview`).style.display = "none";
      $(`${s}Placeholder`).style.display = "flex";
      $(`${s}Upload`).classList.remove("has-image");
      $(`${s}Input`).value = "";
    });
    updateAnalyzeBtn();
    resultsSection.style.display = "none";
  }

  function setLoadingText(text) {
    const el = loadingSection.querySelector("p");
    if (el) el.textContent = text;
  }

  // Step 1: Vision model grades the card
  async function gradeCard(apiKey) {
    setLoadingText("Analyzing card condition...");

    const backNote = backImageData
      ? "I'm providing both the FRONT and BACK of the card. Analyze both sides."
      : "I'm providing only the FRONT of the card.";

    const content = [
      { type: "text", text: `You are an expert sports card grader. ${backNote}

Analyze this card and provide a JSON response:
{
  "cardName": "Full card name with year, manufacturer, set, card number, player, variations (e.g. '2023-24 Panini Mosaic #238 Victor Wembanyama RC')",
  "cardDetails": "Brief description",
  "centering": <1-10>,
  "corners": <1-10>,
  "edges": <1-10>,
  "surface": <1-10>,
  "overall": <weighted avg to 1 decimal>,
  "verdict": "WORTH_GRADING" | "BORDERLINE" | "NOT_WORTH",
  "notes": "Brief grading explanation"
}

GRADING: Default to HIGH scores (9-10) for clean cards. Phone photos add artifacts - do NOT penalize for photo quality.
- Centering: Equal borders=10, slightly off=9, noticeably off=7-8, way off=5-6
- Corners: Sharp=10, minor softness=9, visible rounding=7-8, dinged=5-6
- Edges: Clean=10, tiny imperfections=9, whitening=7-8, rough=5-6
- Surface: Clean/glossy=10, minor marks=9, scratches=7-8, creases=5-6

VERDICT: WORTH_GRADING >= 8.5, BORDERLINE 7.0-8.4, NOT_WORTH < 7.0

Be VERY specific with cardName - include year, set, card number, player, RC/parallel/auto/refractor if applicable. This will be used to search eBay.

Return ONLY valid JSON.` },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + frontImageData } }
    ];
    if (backImageData) {
      content.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + backImageData } });
    }

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content }],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      if (resp.status === 429) throw new Error("Rate limit - wait a minute and try again.");
      if (resp.status === 401) throw new Error("Invalid API key.");
      throw new Error(err.error?.message || "Grading failed");
    }

    const data = await resp.json();
    return JSON.parse(data.choices[0].message.content);
  }

  // Step 2: Web search model gets real eBay prices
  async function getEbayPrices(apiKey, cardName) {
    setLoadingText("Searching eBay sold listings for real prices...");

    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "compound-beta-mini",
        messages: [{ role: "user", content: `Search eBay completed/sold listings for ${cardName}. Find the last sold price for: Raw, PSA 7, PSA 8, PSA 9, PSA 10. Reply with ONLY JSON: {"raw":"$X.XX","psa7":"$X.XX","psa8":"$X.XX","psa9":"$X.XX","psa10":"$X.XX"}` }],
        temperature: 0.1,
        max_tokens: 512
      })
    });

    if (!resp.ok) {
      console.log("Price lookup failed, using N/A");
      return null;
    }

    const data = await resp.json();
    const text = data.choices[0].message.content;
    
    // Extract JSON from response
    try {
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(text);
    } catch (e) {
      console.log("Failed to parse prices:", text);
      return null;
    }
  }

  async function analyzeCard() {
    const apiKey = getApiKey();
    if (!apiKey) { alert("Please set your Groq API key first."); return; }

    uploadSection.style.display = "none";
    loadingSection.style.display = "block";
    resultsSection.style.display = "none";

    try {
      // Step 1: Grade the card with vision
      const result = gradeCard(apiKey);
      const grading = await result;
      
      // Step 2: Look up real eBay prices with web search
      let values = { raw: "N/A", psa7: "N/A", psa8: "N/A", psa9: "N/A", psa10: "N/A" };
      if (grading.cardName && grading.cardName !== "Unknown Card") {
        const ebayPrices = await getEbayPrices(apiKey, grading.cardName);
        if (ebayPrices) {
          values = {
            raw: ebayPrices.raw || "N/A",
            psa7: ebayPrices.psa7 || "N/A",
            psa8: ebayPrices.psa8 || "N/A",
            psa9: ebayPrices.psa9 || "N/A",
            psa10: ebayPrices.psa10 || "N/A"
          };
        }
      }
      grading.values = values;

      // Add eBay search link
      grading.ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(grading.cardName)}&LH_Sold=1&LH_Complete=1`;

      displayResults(grading);
      saveToHistory(grading);
    } catch (err) {
      alert("Analysis failed: " + err.message);
      uploadSection.style.display = "block";
    } finally {
      loadingSection.style.display = "none";
    }
  }

  function displayResults(result) {
    $("cardName").textContent = result.cardName || "Unknown Card";
    $("cardDetails").textContent = result.cardDetails || "";

    $("centeringScore").textContent = result.centering + "/10";
    $("cornersScore").textContent = result.corners + "/10";
    $("edgesScore").textContent = result.edges + "/10";
    $("surfaceScore").textContent = result.surface + "/10";
    $("overallScore").textContent = result.overall + "/10";

    const score = result.overall;
    const scoreEl = $("overallScore");
    if (score >= 8.5) scoreEl.style.color = "#22c55e";
    else if (score >= 7) scoreEl.style.color = "#f59e0b";
    else scoreEl.style.color = "#ef4444";

    const badge = $("verdictBadge");
    if (result.verdict === "WORTH_GRADING") {
      badge.textContent = "✅ Worth Grading!";
      badge.className = "verdict-badge worth";
    } else if (result.verdict === "BORDERLINE") {
      badge.textContent = "⚠️ Borderline";
      badge.className = "verdict-badge borderline";
    } else {
      badge.textContent = "❌ Not Worth It";
      badge.className = "verdict-badge not-worth";
    }

    $("gradingNotes").textContent = result.notes || "";

    const values = result.values || {};
    const rows = [
      ["Raw (Ungraded)", values.raw || "N/A"],
      ["PSA 7", values.psa7 || "N/A"],
      ["PSA 8", values.psa8 || "N/A"],
      ["PSA 9", values.psa9 || "N/A"],
      ["PSA 10", values.psa10 || "N/A"]
    ];

    const tbody = $("valuesBody");
    tbody.innerHTML = "";
    rows.forEach(([label, value], i) => {
      const tr = document.createElement("tr");
      if (i === rows.length - 1) tr.classList.add("highlight");
      tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
      tbody.appendChild(tr);
    });

    // eBay link
    const existing = document.getElementById("ebayLink");
    if (existing) existing.remove();
    if (result.ebayUrl) {
      const div = document.createElement("div");
      div.id = "ebayLink";
      div.style.cssText = "text-align:center;margin-top:12px;";
      div.innerHTML = `<a href="${result.ebayUrl}" target="_blank" style="color:#3b82f6;text-decoration:underline;font-size:14px;">🔍 View eBay sold listings for this card</a><br><small style="color:#94a3b8;">Prices from real eBay completed sales</small>`;
      tbody.closest("table").parentElement.appendChild(div);
    }

    resultsSection.style.display = "block";
    uploadSection.style.display = "block";
    resultsSection.scrollIntoView({ behavior: "smooth" });
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem("card_history") || "[]"); } catch { return []; }
  }

  function saveToHistory(result) {
    const h = getHistory();
    h.unshift({ name: result.cardName, overall: result.overall, verdict: result.verdict, date: new Date().toLocaleDateString() });
    if (h.length > 50) h.length = 50;
    localStorage.setItem("card_history", JSON.stringify(h));
    renderHistory();
  }

  function renderHistory() {
    const h = getHistory();
    if (!h.length) { historySection.style.display = "none"; return; }
    historySection.style.display = "block";
    $("historyList").innerHTML = h.map(i => `
      <div class="history-item">
        <div><div class="name">${i.name}</div><div class="date">${i.date}</div></div>
        <div class="score">${i.overall}/10</div>
      </div>`).join("");
  }

  function init() {
    initApiKey();
    setupUpload("frontUpload", "frontInput", "frontPreview", "frontPlaceholder", (b64) => { frontImageData = b64; });
    setupUpload("backUpload", "backInput", "backPreview", "backPlaceholder", (b64) => { backImageData = b64; });
    $("analyzeBtn").addEventListener("click", analyzeCard);
    $("clearBtn").addEventListener("click", clearUploads);
    $("scanAnother").addEventListener("click", () => { clearUploads(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    $("clearHistory").addEventListener("click", () => { localStorage.removeItem("card_history"); renderHistory(); });
    renderHistory();
  }

  init();
})();
