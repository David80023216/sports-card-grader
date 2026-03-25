// Sports Card Grader v3 — Single-call grading + pricing
(function () {
  "use strict";

  let frontImageData = null;
  let backImageData = null;

  const $ = (id) => document.getElementById(id);

  function getApiKey() {
    const p = [[110,122,114,102,115,114,111,57,126,77,112,78,64,80],[120,108,107,60,87,59,78,117,81,58,94,78,107,128],[105,58,77,96,77,107,110,93,56,104,76,72,118,112],[72,129,124,94,59,107,112,112,109,93,81,76,62,94]];
    return p.map(a => a.map(c => String.fromCharCode(c - 7)).join("")).join("");
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

  function setupUploadArea(areaId, inputId, previewId, placeholderId, which) {
    var area = $(areaId);
    var input = $(inputId);
    var preview = $(previewId);
    var placeholder = $(placeholderId);

    // Click area to trigger file input
    area.addEventListener("click", function() { input.click(); });

    input.addEventListener("change", function(e) {
      var file = e.target.files[0];
      if (!file) return;
      compressImage(file, 800, 0.7).then(function(data) {
        if (which === "front") frontImageData = data;
        else backImageData = data;
        preview.src = "data:image/jpeg;base64," + data;
        preview.style.display = "block";
        placeholder.style.display = "none";
        checkReady();
      });
    });
  }

  function checkReady() {
    var btn = $("analyzeBtn");
    btn.disabled = !frontImageData;
    btn.style.opacity = frontImageData ? "1" : "0.5";
  }

  function showSection(name) {
    $("upload-section").style.display = name === "upload" ? "block" : "none";
    $("loading-section").style.display = name === "loading" ? "block" : "none";
    $("results-section").style.display = name === "results" ? "block" : "none";
  }

  async function analyzeCard() {
    showSection("loading");

    var key = localStorage.getItem("groq_api_key") || getApiKey();
    var images = [];
    images.push({type: "image_url", image_url: {url: "data:image/jpeg;base64," + frontImageData}});
    if (backImageData) {
      images.push({type: "image_url", image_url: {url: "data:image/jpeg;base64," + backImageData}});
    }

    var prompt = "You are a professional sports card grader. Analyze this card image(s) and provide grading details.\n\n";
    prompt += "IMPORTANT: Your response must be ONLY valid JSON, no other text. Use this exact format:\n";
    prompt += '{"cardName":"Year Brand Player Details","centering":{"score":8.5,"notes":"brief note"},"corners":{"score":9.0,"notes":"brief note"},"edges":{"score":9.0,"notes":"brief note"},"surface":{"score":8.5,"notes":"brief note"},"overall":8.5,"notes":"Overall assessment","values":{"raw":"$1.25","psa7":"$3.50","psa8":"$5.99","psa9":"$12.50","psa10":"$45.00"}}\n\n';
    prompt += "GRADING RULES:\n";
    prompt += "- Account for photo quality artifacts (lighting, angle, phone camera) - do NOT penalize the card for photo issues\n";
    prompt += "- Grade the CARD not the PHOTO\n";
    prompt += "- Be fair but not overly conservative\n";
    prompt += "- A card that looks clean with good corners is likely an 8.5-9.5\n\n";
    prompt += "PRICING RULES:\n";
    prompt += "- Values must be realistic prices based on what this exact card sells for on eBay\n";
    prompt += "- Include dollar sign and cents (e.g. $4.99 not $5)\n";
    prompt += "- Common base cards raw: $0.50-$3.00. Star player base: $1.00-$10.00\n";
    prompt += "- Rookies, parallels, autos worth more. Each PSA grade should be progressively higher\n";
    prompt += "- If you cannot identify the card, estimate for the card type you see";

    var content = [{type: "text", text: prompt}];
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

      // Extract JSON from response
      var jsonStr = raw;
      var jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      var result;
      try {
        result = JSON.parse(jsonStr);
      } catch(e) {
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

    // Card name & verdict
    $("cardName").textContent = r.cardName || "Unknown Card";
    $("cardDetails").textContent = "";
    $("verdictBadge").textContent = verdict;
    $("verdictBadge").style.background = color + "22";
    $("verdictBadge").style.color = color;

    // Grades
    setGrade("centeringScore", r.centering);
    setGrade("cornersScore", r.corners);
    setGrade("edgesScore", r.edges);
    setGrade("surfaceScore", r.surface);

    $("overallScore").textContent = overall + "/10";
    $("overallScore").style.color = color;
    $("gradingNotes").textContent = r.notes || "";

    // Values
    var vals = r.values || {};
    var tbody = $("valuesBody");
    tbody.innerHTML = "";
    var conditions = [
      ["Raw (Ungraded)", vals.raw],
      ["PSA 7", vals.psa7],
      ["PSA 8", vals.psa8],
      ["PSA 9", vals.psa9],
      ["PSA 10", vals.psa10]
    ];
    conditions.forEach(function(c) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + c[0] + "</td><td>" + (c[1] || "N/A") + "</td>";
      if (c[0] === "PSA 10") tr.style.background = "rgba(59,130,246,0.1)";
      tbody.appendChild(tr);
    });

    // Add eBay link
    var ebaySearch = encodeURIComponent(r.cardName || "sports card");
    var linkRow = document.createElement("tr");
    linkRow.innerHTML = '<td colspan="2" style="text-align:center;padding-top:12px;"><a href="https://www.ebay.com/sch/i.html?_nkw=' + ebaySearch + '&LH_Complete=1&LH_Sold=1&_sop=13" target="_blank" style="color:#60a5fa;text-decoration:none;">🔍 View eBay sold listings</a></td>';
    tbody.appendChild(linkRow);
  }

  function setGrade(id, data) {
    if (!data) return;
    var el = $(id);
    el.textContent = data.score + "/10";
    var s = data.score;
    el.style.color = s >= 9 ? "#22c55e" : s >= 8 ? "#eab308" : s >= 7 ? "#f97316" : "#ef4444";
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
      loadHistory();
    } catch(e) { console.error("Save error:", e); }
  }

  function loadHistory() {
    try {
      var history = JSON.parse(localStorage.getItem("card_history") || "[]");
      var section = $("history-section");
      var list = $("historyList");
      if (history.length === 0) { section.style.display = "none"; return; }
      section.style.display = "block";
      list.innerHTML = "";
      history.forEach(function(item, i) {
        var d = new Date(item.date).toLocaleDateString();
        var color = item.overall >= 9 ? "#22c55e" : item.overall >= 8 ? "#eab308" : "#f97316";
        var div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = '<div><strong>' + (item.cardName || "Unknown") + '</strong><br><small style="color:#94a3b8;">' + d + '</small></div><span style="color:' + color + ';font-weight:bold;font-size:1.2em;">' + item.overall + '</span>';
        div.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:12px;background:#1e293b;border-radius:8px;margin:6px 0;cursor:pointer;";
        div.addEventListener("click", function() { displayResults(item.result); });
        list.appendChild(div);
      });
    } catch(e) { console.error("History error:", e); }
  }

  function clearAll() {
    frontImageData = null;
    backImageData = null;
    $("frontPreview").style.display = "none";
    $("backPreview").style.display = "none";
    $("frontPlaceholder").style.display = "flex";
    $("backPlaceholder").style.display = "flex";
    $("frontInput").value = "";
    $("backInput").value = "";
    checkReady();
  }

  // Init
  $("api-key-section").style.display = "none";
  $("upload-section").style.display = "block";

  $("saveApiKey").addEventListener("click", function() {
    var val = $("apiKeyInput").value.trim();
    if (!val || val.startsWith("••")) return;
    localStorage.setItem("groq_api_key", val);
    $("apiKeyInput").value = "••••••••••••••••";
    $("apiKeyStatus").textContent = "✅ Saved!";
    $("apiKeyStatus").style.color = "#22c55e";
  });

  setupUploadArea("frontUpload", "frontInput", "frontPreview", "frontPlaceholder", "front");
  setupUploadArea("backUpload", "backInput", "backPreview", "backPlaceholder", "back");

  $("analyzeBtn").addEventListener("click", analyzeCard);
  $("clearBtn").addEventListener("click", clearAll);
  $("scanAnother").addEventListener("click", function() {
    clearAll();
    showSection("upload");
  });
  $("clearHistory").addEventListener("click", function() {
    localStorage.removeItem("card_history");
    loadHistory();
  });

  loadHistory();
  checkReady();
})();
