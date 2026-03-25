// Sports Card Grader — Standalone with Google Gemini API
(function () {
  "use strict";

  // ---- State ----
  let frontImageData = null; // base64
  let backImageData = null;

  // ---- Elements ----
  const $ = (id) => document.getElementById(id);
  const apiKeySection = $("api-key-section");
  const uploadSection = $("upload-section");
  const loadingSection = $("loading-section");
  const resultsSection = $("results-section");
  const historySection = $("history-section");

  // ---- API Key ----
  const BUILT_IN_KEY = "gen-lang-client-0194706602";
  function getApiKey() {
    return BUILT_IN_KEY || localStorage.getItem("gemini_api_key") || "";
  }

  function initApiKey() {
    // Key is built-in, auto-enable
    apiKeySection.style.display = "none";
    uploadSection.style.display = "block";
    $("saveApiKey").addEventListener("click", () => {
      const val = $("apiKeyInput").value.trim();
      if (!val || val.startsWith("••")) return;
      localStorage.setItem("gemini_api_key", val);
      $("apiKeyInput").value = "••••••••••••••••";
      $("apiKeyStatus").textContent = "✅ API key saved. You're ready to scan!";
      $("apiKeyStatus").style.color = "#22c55e";
      uploadSection.style.display = "block";
    });
  }

  // ---- Image Upload ----
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
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl.split(",")[1]); // base64 only
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

  function updateAnalyzeBtn() {
    $("analyzeBtn").disabled = !frontImageData;
  }

  function clearUploads() {
    frontImageData = null;
    backImageData = null;
    ["front", "back"].forEach((side) => {
      $(`${side}Preview`).style.display = "none";
      $(`${side}Placeholder`).style.display = "flex";
      $(`${side}Upload`).classList.remove("has-image");
      $(`${side}Input`).value = "";
    });
    updateAnalyzeBtn();
    resultsSection.style.display = "none";
  }

  // ---- Gemini API ----
  async function analyzeCard() {
    const apiKey = getApiKey();
    if (!apiKey) { alert("Please set your Gemini API key first."); return; }

    uploadSection.style.display = "none";
    loadingSection.style.display = "block";
    resultsSection.style.display = "none";

    const prompt = buildPrompt();
    const imageParts = [
      { inlineData: { mimeType: "image/jpeg", data: frontImageData } }
    ];
    if (backImageData) {
      imageParts.push({ inlineData: { mimeType: "image/jpeg", data: backImageData } });
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                ...imageParts
              ]
            }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json"
            }
          })
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "API request failed");
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No response from Gemini");

      const result = JSON.parse(text);
      displayResults(result);
      saveToHistory(result);
    } catch (err) {
      alert("Analysis failed: " + err.message);
      uploadSection.style.display = "block";
    } finally {
      loadingSection.style.display = "none";
    }
  }

  function buildPrompt() {
    const backNote = backImageData
      ? "I'm providing both the FRONT and BACK of the card. Analyze both sides."
      : "I'm providing only the FRONT of the card.";

    return `You are an expert sports card grader. ${backNote}

Analyze this card and provide a JSON response with this EXACT structure:
{
  "cardName": "Full card name (e.g., '2023-24 Panini Mosaic #238 Victor Wembanyama RC')",
  "cardDetails": "Brief description (player, team, year, set, card number)",
  "centering": <score 1-10>,
  "corners": <score 1-10>,
  "edges": <score 1-10>,
  "surface": <score 1-10>,
  "overall": <weighted average to 1 decimal>,
  "verdict": "WORTH_GRADING" | "BORDERLINE" | "NOT_WORTH",
  "notes": "Brief explanation of grades and recommendation",
  "values": {
    "raw": "$X",
    "psa7": "$X",
    "psa8": "$X",
    "psa9": "$X",
    "psa10": "$X"
  }
}

GRADING GUIDELINES:
- Default to HIGH scores (9-10) for cards that look clean. Phone photos add compression artifacts, glare, and blur that make cards look worse than they are. Do NOT penalize for photo quality issues.
- Centering: Check border alignment. Equal borders = 10. Slightly off = 9. Noticeably off = 7-8. Way off = 5-6.
- Corners: Sharp and crisp = 10. Very minor softness = 9. Visible rounding = 7-8. Dinged = 5-6.
- Edges: Clean and smooth = 10. Tiny imperfections = 9. Whitening/chipping = 7-8. Rough = 5-6.
- Surface: Clean and glossy = 10. Minor marks = 9. Scratches/print defects = 7-8. Creases = 5-6.

VERDICT THRESHOLDS:
- WORTH_GRADING: overall >= 8.5
- BORDERLINE: overall 7.0 - 8.4
- NOT_WORTH: overall < 7.0

For VALUES: Estimate current market values based on your knowledge. If you're unsure, provide reasonable estimates. Use "$X" format.

IMPORTANT: Return ONLY valid JSON, no markdown or extra text.`;
  }

  // ---- Display Results ----
  function displayResults(result) {
    $("cardName").textContent = result.cardName || "Unknown Card";
    $("cardDetails").textContent = result.cardDetails || "";

    $("centeringScore").textContent = result.centering + "/10";
    $("cornersScore").textContent = result.corners + "/10";
    $("edgesScore").textContent = result.edges + "/10";
    $("surfaceScore").textContent = result.surface + "/10";
    $("overallScore").textContent = result.overall + "/10";

    // Color the overall score
    const score = result.overall;
    const scoreEl = $("overallScore");
    if (score >= 8.5) scoreEl.style.color = "#22c55e";
    else if (score >= 7) scoreEl.style.color = "#f59e0b";
    else scoreEl.style.color = "#ef4444";

    // Verdict
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

    // Values table
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

    resultsSection.style.display = "block";
    uploadSection.style.display = "block";
    resultsSection.scrollIntoView({ behavior: "smooth" });
  }

  // ---- History ----
  function getHistory() {
    try { return JSON.parse(localStorage.getItem("card_history") || "[]"); }
    catch { return []; }
  }

  function saveToHistory(result) {
    const history = getHistory();
    history.unshift({
      name: result.cardName,
      overall: result.overall,
      verdict: result.verdict,
      date: new Date().toLocaleDateString()
    });
    if (history.length > 50) history.length = 50;
    localStorage.setItem("card_history", JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const history = getHistory();
    if (!history.length) {
      historySection.style.display = "none";
      return;
    }
    historySection.style.display = "block";
    const list = $("historyList");
    list.innerHTML = history.map((h) => `
      <div class="history-item">
        <div>
          <div class="name">${h.name}</div>
          <div class="date">${h.date}</div>
        </div>
        <div class="score">${h.overall}/10</div>
      </div>
    `).join("");
  }

  // ---- Init ----
  function init() {
    initApiKey();
    setupUpload("frontUpload", "frontInput", "frontPreview", "frontPlaceholder", (b64) => { frontImageData = b64; });
    setupUpload("backUpload", "backInput", "backPreview", "backPlaceholder", (b64) => { backImageData = b64; });
    $("analyzeBtn").addEventListener("click", analyzeCard);
    $("clearBtn").addEventListener("click", clearUploads);
    $("scanAnother").addEventListener("click", () => {
      clearUploads();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("clearHistory").addEventListener("click", () => {
      localStorage.removeItem("card_history");
      renderHistory();
    });
    renderHistory();
  }

  init();
})();
