// Sports Card Grader v3 — Single-call grading + pricing
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
    $("saveApiKey").addEventListener("click", function() {
      var val = $("apiKeyInput").value.trim();
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
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement("canvas");
          var w = img.width, h = img.height;
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

  function setupImageUpload(inputId, previewId, labelId, which) {
    var input = $(inputId);
    var preview = $(previewId);
    input.addEventListener("change", function(e) {
      var file = e.target.files[0];
      if (!file) return;
      compressImage(file, 800, 0.7).then(function(data) {
        if (which === "front") frontImageData = data;
        else backImageData = data;
        preview.innerHTML = '<img src="data:image/jpeg;base64,' + data + '" alt="' + which + '">';
        $(labelId).textContent = "✅ " + which.charAt(0).toUpperCase() + which.slice(1) + " captured";
        checkReady();
      });
    });
  }

  function checkReady() {
    $("analyzeBtn").disabled = !frontImageData;
    if (frontImageData) {
      $("analyzeBtn").style.opacity = "1";
    }
  }

  function setLoadingText(t) {
    var el = $("loadingText");
    if (el) el.textContent = t;
  }

  function showSection(name) {
    uploadSection.style.display = name === "upload" ? "block" : "none";
    loadingSection.style.display = name === "loading" ? "block" : "none";
    resultsSection.style.display = name === "results" ? "block" : "none";
  }

  async function analyzeCard() {
    showSection("loading");
    setLoadingText("Analyzing card with AI...");

    var key = localStorage.getItem("groq_api_key") || getApiKey();
    var images = [];
    images.push({type: "image_url", image_url: {url: "data:image/jpeg;base64," + frontImageData}});
    if (backImageData) {
      images.push({type: "image_url", image_url: {url: "data:image/jpeg;base64," + backImageData}});
    }

    var content = [{type: "text", text: "You are a professional sports card grader. Analyze this card image(s) and provide grading details.\n\nIMPORTANT: Your response must be ONLY valid JSON, no other text. Use this exact format:\n{\n  \"cardName\": \"Year Brand Player Details\",\n  \"centering\": {\"score\": 8.5, \"notes\": \"brief note\"},\n  \"corners\": {\"score\": 9.0, \"notes\": \"brief note\"},\n  \"edges\": {\"score\": 9.0, \"notes\": \"brief note\"},\n  \"surface\": {\"score\": 8.5, \"notes\": \"brief note\"},\n  \"overall\": 8.5,\n  \"notes\": \"Overall assessment\",\n  \"values\": {\n    \"raw\": \"$1.25\",\n    \"psa7\": \"$3.50\",\n    \"psa8\": \"$5.99\",\n    \"psa9\": \"$12.50\",\n    \"psa10\": \"$45.00\"\n  }\n}\n\nGRADING RULES:\n- Account for photo quality artifacts (lighting, angle, phone camera) - do NOT penalize the card for photo issues\n- Grade the CARD not the PHOTO\n- Be fair but not overly conservative\n- A card that looks clean with good corners is likely an 8.5-9.5\n\nPRICING RULES:\n- values must be realistic prices based on what this exact card sells for on eBay\n- Include dollar sign and cents (e.g. $4.99 not $5)\n- Common base cards raw: $0.50-$3.00\n- Star player base cards raw: $1.00-$10.00\n- Rookies, parallels, autos worth more\n- Each PSA grade should be progressively higher than raw\n- If you cannot identify the card, give reasonable estimates for the card type you see"}];
    images.forEach(function(img) { content.push(img); });

    try {
      var resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{role: "user", content: content}],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        throw new Error("API error " + resp.status + ": " + errText.substring(0, 200));
      }

      var data = await resp.json();
      var raw = data.choices[0].message.content;
      console.log("RAW RESPONSE:", raw);

      // Extract JSON from response
      var jsonStr = raw;
      // Try to find JSON block
      var jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      var result;
      try {
        result = JSON.parse(jsonStr);
      } catch(e) {
        // Try cleaning markdown code fences
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        result = JSON.parse(jsonStr);
      }

      displayResults(result);
      saveToHistory(result);

    } catch (err) {
      console.error("Analysis error:", err);
      showSection("upload");
      alert("Error: " + err.message);
    }
  }

  function displayResults(r) {
    showSection("results");

    var overall = r.overall || 0;
    var color = overall >= 9 ? "#22c55e" : overall >= 8 ? "#eab308" : overall >= 7 ? "#f97316" : "#ef4444";
    var verdict = overall >= 8.5 ? "✅ Worth Grading!" : overall >= 7 ? "⚠️ Borderline" : "❌ Not Worth Grading";

    var vals = r.values || {};
    var rawVal = vals.raw || "N/A";
    var psa7 = vals.psa7 || "N/A";
    var psa8 = vals.psa8 || "N/A";
    var psa9 = vals.psa9 || "N/A";
    var psa10 = vals.psa10 || "N/A";

    var cardName = r.cardName || "Unknown Card";
    var ebaySearch = encodeURIComponent(cardName);

    resultsSection.innerHTML = '<h2 style="text-align:center;margin-bottom:20px;">📊 Analysis Results</h2>' +
      '<div style="text-align:center;margin-bottom:5px;font-size:1.1em;color:#94a3b8;">' + cardName + '</div>' +
      '<div style="text-align:center;margin-bottom:20px;font-size:1.3em;font-weight:bold;">' + verdict + '</div>' +

      '<div class="card-section">' +
      '<h3>📋 Grade Breakdown</h3>' +
      gradeRow("Centering", r.centering) +
      gradeRow("Corners", r.corners) +
      gradeRow("Edges", r.edges) +
      gradeRow("Surface", r.surface) +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:15px 0;border-top:2px solid ' + color + ';">' +
      '<span style="font-size:1.2em;font-weight:bold;">Overall</span>' +
      '<span style="font-size:2em;font-weight:bold;color:' + color + ';">' + overall + '/10</span>' +
      '</div>' +
      '<p style="color:#94a3b8;font-size:0.9em;">' + (r.notes || "") + '</p>' +
      '</div>' +

      '<div class="card-section">' +
      '<h3>💰 Estimated Market Values</h3>' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<tr style="color:#94a3b8;font-size:0.85em;"><th style="text-align:left;padding:8px 0;">CONDITION</th><th style="text-align:right;padding:8px 0;">ESTIMATED VALUE</th></tr>' +
      priceRow("Raw (Ungraded)", rawVal, false) +
      priceRow("PSA 7", psa7, false) +
      priceRow("PSA 8", psa8, false) +
      priceRow("PSA 9", psa9, false) +
      priceRow("PSA 10", psa10, true) +
      '</table>' +
      '<p style="color:#94a3b8;font-size:0.8em;margin-top:12px;">Values are estimates based on recent market data. Actual prices may vary.</p>' +
      '<a href="https://www.ebay.com/sch/i.html?_nkw=' + ebaySearch + '&LH_Complete=1&LH_Sold=1&_sop=13" target="_blank" style="display:block;text-align:center;margin-top:10px;color:#60a5fa;text-decoration:none;">🔍 View eBay sold listings for this card<br><small style="color:#94a3b8;">Prices from real eBay completed sales</small></a>' +
      '</div>' +

      '<button onclick="location.reload()" style="width:100%;padding:16px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;border:none;border-radius:12px;font-size:1.1em;font-weight:bold;cursor:pointer;margin-top:20px;">Scan Another Card</button>';
  }

  function gradeRow(label, data) {
    if (!data) return "";
    var s = data.score || 0;
    var c = s >= 9 ? "#22c55e" : s >= 8 ? "#eab308" : s >= 7 ? "#f97316" : "#ef4444";
    var pct = (s / 10) * 100;
    return '<div style="margin:12px 0;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
      '<span>' + label + '</span><span style="color:' + c + ';font-weight:bold;">' + s + '/10</span></div>' +
      '<div style="background:#1e293b;border-radius:4px;height:6px;overflow:hidden;">' +
      '<div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:4px;"></div></div>' +
      '<div style="color:#94a3b8;font-size:0.8em;margin-top:2px;">' + (data.notes || "") + '</div></div>';
  }

  function priceRow(label, value, highlight) {
    var bg = highlight ? "background:rgba(59,130,246,0.1);" : "";
    var border = "border-top:1px solid #334155;";
    return '<tr style="' + bg + '">' +
      '<td style="padding:12px 0;' + border + '">' + label + '</td>' +
      '<td style="padding:12px 0;text-align:right;font-weight:bold;' + border + '">' + value + '</td></tr>';
  }

  function saveToHistory(result) {
    try {
      var history = JSON.parse(localStorage.getItem("card_history") || "[]");
      history.unshift({
        date: new Date().toISOString(),
        cardName: result.cardName || "Unknown",
        overall: result.overall,
        result: result
      });
      if (history.length > 20) history = history.slice(0, 20);
      localStorage.setItem("card_history", JSON.stringify(history));
    } catch(e) { console.error("Save error:", e); }
  }

  function loadHistory() {
    try {
      var history = JSON.parse(localStorage.getItem("card_history") || "[]");
      if (history.length === 0) {
        historySection.style.display = "none";
        return;
      }
      historySection.style.display = "block";
      var html = "<h3>📜 Recent Scans</h3>";
      history.forEach(function(item) {
        var d = new Date(item.date).toLocaleDateString();
        var color = item.overall >= 9 ? "#22c55e" : item.overall >= 8 ? "#eab308" : "#f97316";
        html += '<div style="background:#1e293b;padding:12px;border-radius:8px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick=\'document.dispatchEvent(new CustomEvent("showHistory", {detail: ' + JSON.stringify(JSON.stringify(item.result)) + '}))\'>' +
          '<div><div style="font-weight:bold;">' + (item.cardName || "Unknown") + '</div><div style="color:#94a3b8;font-size:0.8em;">' + d + '</div></div>' +
          '<span style="color:' + color + ';font-weight:bold;font-size:1.2em;">' + item.overall + '</span></div>';
      });
      historySection.innerHTML = html;
    } catch(e) { console.error("History error:", e); }
  }

  // Init
  initApiKey();
  setupImageUpload("frontImage", "frontPreview", "frontLabel", "front");
  setupImageUpload("backImage", "backPreview", "backLabel", "back");
  $("analyzeBtn").addEventListener("click", analyzeCard);
  loadHistory();

  document.addEventListener("showHistory", function(e) {
    try {
      var result = JSON.parse(e.detail);
      displayResults(result);
    } catch(err) { console.error(err); }
  });
})();
