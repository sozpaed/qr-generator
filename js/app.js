"use strict";

qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const BORDER_MODULES = 4;
const LOGO_RATIO = 0.22;

function getRelativeLuminance(hex) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;

    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function evaluateContrast(fillHex, backHex) {
    const lumFill = getRelativeLuminance(fillHex);
    const lumBack = getRelativeLuminance(backHex);
    const lighter = Math.max(lumFill, lumBack);
    const darker = Math.min(lumFill, lumBack);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    if (lumFill > lumBack) {
        return "Hinweis: Die Vordergrundfarbe ist heller als der Hintergrund (invertierter QR-Code). Viele Smartphone-Kameras können solche Codes nicht zuverlässig lesen.";
    }
    if (ratio < 3.5) {
        return `Hinweis: Der Farbkontrast ist niedrig (${ratio.toFixed(1)}:1). Für zuverlässiges Scannen empfiehlt sich eine dunkle Vordergrundfarbe auf hellem Hintergrund.`;
    }
    return null;
}

function createQrMatrix(text, ecLevel) {
    const qr = qrcode(0, ecLevel);
    qr.addData(text);
    qr.make();
    return qr;
}

function renderQrToCanvas(qr, canvas, options) {
    const { fillColor, backColor, boxSize, logoImg } = options;
    const moduleCount = qr.getModuleCount();
    const totalSize = (moduleCount + BORDER_MODULES * 2) * boxSize;

    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = backColor;
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = fillColor;
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
                ctx.fillRect(
                    (col + BORDER_MODULES) * boxSize,
                    (row + BORDER_MODULES) * boxSize,
                    boxSize,
                    boxSize
                );
            }
        }
    }

    if (logoImg) {
        const maxLogoSize = Math.floor(totalSize * LOGO_RATIO);
        const scale = Math.min(maxLogoSize / logoImg.width, maxLogoSize / logoImg.height);
        const logoW = Math.round(logoImg.width * scale);
        const logoH = Math.round(logoImg.height * scale);

        const pad = Math.max(4, Math.floor(boxSize / 2));
        const bgW = logoW + pad * 2;
        const bgH = logoH + pad * 2;
        const bgX = Math.floor((totalSize - bgW) / 2);
        const bgY = Math.floor((totalSize - bgH) / 2);

        ctx.fillStyle = backColor;
        ctx.fillRect(bgX, bgY, bgW, bgH);
        ctx.drawImage(logoImg, bgX + pad, bgY + pad, logoW, logoH);
    }
}

function buildQrSvg(qr, options) {
    const { fillColor, backColor, boxSize, logoImg, logoDataUrl } = options;
    const moduleCount = qr.getModuleCount();
    const totalModules = moduleCount + BORDER_MODULES * 2;
    const pixelSize = totalModules * boxSize;

    const parts = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges">`,
        `<rect width="100%" height="100%" fill="${backColor}"/>`
    ];

    for (let row = 0; row < moduleCount; row++) {
        let runStart = null;
        for (let col = 0; col <= moduleCount; col++) {
            const isDark = col < moduleCount && qr.isDark(row, col);
            if (isDark && runStart === null) {
                runStart = col;
            } else if (!isDark && runStart !== null) {
                const runLength = col - runStart;
                parts.push(
                    `<rect x="${runStart + BORDER_MODULES}" y="${row + BORDER_MODULES}" width="${runLength}" height="1" fill="${fillColor}"/>`
                );
                runStart = null;
            }
        }
    }

    if (logoImg && logoDataUrl) {
        const maxLogoModules = totalModules * LOGO_RATIO;
        const aspect = logoImg.width / logoImg.height;
        const logoW = aspect >= 1 ? maxLogoModules : maxLogoModules * aspect;
        const logoH = aspect >= 1 ? maxLogoModules / aspect : maxLogoModules;

        const pad = 0.5;
        const bgW = logoW + pad * 2;
        const bgH = logoH + pad * 2;
        const bgX = (totalModules - bgW) / 2;
        const bgY = (totalModules - bgH) / 2;

        parts.push(
            `<rect x="${bgX.toFixed(3)}" y="${bgY.toFixed(3)}" width="${bgW.toFixed(3)}" height="${bgH.toFixed(3)}" fill="${backColor}"/>`,
            `<image href="${logoDataUrl}" x="${(bgX + pad).toFixed(3)}" y="${(bgY + pad).toFixed(3)}" width="${logoW.toFixed(3)}" height="${logoH.toFixed(3)}" preserveAspectRatio="xMidYMid meet"/>`
        );
    }

    parts.push("</svg>");
    return parts.join("\n");
}

document.addEventListener("DOMContentLoaded", () => {
    const urlInput = document.getElementById("urlInput");
    const fillColorInput = document.getElementById("fillColor");
    const backColorInput = document.getElementById("backColor");
    const boxSizeInput = document.getElementById("boxSize");
    const boxSizeVal = document.getElementById("boxSizeVal");
    const errorCorrectionInput = document.getElementById("errorCorrection");
    const ecHint = document.getElementById("ecHint");
    const logoInput = document.getElementById("logoInput");
    const clearLogoBtn = document.getElementById("clearLogoBtn");
    const logoError = document.getElementById("logoError");
    const contrastWarning = document.getElementById("contrastWarning");
    const statusText = document.getElementById("statusText");
    const canvas = document.getElementById("qrCanvas");
    const downloadPngBtn = document.getElementById("downloadPngBtn");
    const downloadSvgBtn = document.getElementById("downloadSvgBtn");

    let loadedLogo = null;
    let logoDataUrl = null;
    let savedEcLevel = errorCorrectionInput.value;
    let currentSvgBlobUrl = null;

    function setDownloadState(enabled, pngHref = "", svgHref = "") {
        if (enabled) {
            downloadPngBtn.href = pngHref;
            downloadPngBtn.classList.remove("disabled");
            downloadPngBtn.removeAttribute("aria-disabled");

            downloadSvgBtn.href = svgHref;
            downloadSvgBtn.classList.remove("disabled");
            downloadSvgBtn.removeAttribute("aria-disabled");
        } else {
            downloadPngBtn.removeAttribute("href");
            downloadPngBtn.classList.add("disabled");
            downloadPngBtn.setAttribute("aria-disabled", "true");

            downloadSvgBtn.removeAttribute("href");
            downloadSvgBtn.classList.add("disabled");
            downloadSvgBtn.setAttribute("aria-disabled", "true");
        }
    }

    function showStatus(message, isError = false) {
        canvas.classList.add("hidden");
        statusText.textContent = message;
        statusText.classList.toggle("is-error", isError);
        statusText.classList.remove("hidden");
        setDownloadState(false);
    }

    function resetLogo(clearInput = true) {
        if (clearInput) {
            logoInput.value = "";
        }
        loadedLogo = null;
        logoDataUrl = null;
        clearLogoBtn.classList.add("hidden");
        ecHint.classList.add("hidden");
        errorCorrectionInput.disabled = false;
        errorCorrectionInput.value = savedEcLevel;
    }

    function updateView() {
        const boxSize = parseInt(boxSizeInput.value, 10);
        boxSizeVal.textContent = String(boxSize);

        const fillColor = fillColorInput.value;
        const backColor = backColorInput.value;

        const warning = evaluateContrast(fillColor, backColor);
        if (warning) {
            contrastWarning.textContent = warning;
            contrastWarning.classList.remove("hidden");
        } else {
            contrastWarning.textContent = "";
            contrastWarning.classList.add("hidden");
        }

        const text = urlInput.value.trim();
        if (!text) {
            showStatus("Link eingeben für Live-Vorschau", false);
            return;
        }

        const ecLevel = loadedLogo ? "H" : errorCorrectionInput.value;

        try {
            const qr = createQrMatrix(text, ecLevel);
            const options = {
                fillColor,
                backColor,
                boxSize,
                logoImg: loadedLogo,
                logoDataUrl
            };

            renderQrToCanvas(qr, canvas, options);

            if (currentSvgBlobUrl) {
                URL.revokeObjectURL(currentSvgBlobUrl);
            }
            const svgContent = buildQrSvg(qr, options);
            const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
            currentSvgBlobUrl = URL.createObjectURL(svgBlob);

            statusText.classList.add("hidden");
            canvas.classList.remove("hidden");
            setDownloadState(true, canvas.toDataURL("image/png"), currentSvgBlobUrl);
        } catch (err) {
            const msg = String(err && err.message ? err.message : err);
            if (msg.toLowerCase().includes("overflow")) {
                showStatus("Der eingegebene Text ist zu lang für einen QR-Code.", true);
            } else {
                showStatus(`QR-Code konnte nicht erzeugt werden (${msg}).`, true);
            }
        }
    }

    [urlInput, fillColorInput, backColorInput, boxSizeInput, errorCorrectionInput].forEach((el) => {
        el.addEventListener("input", updateView);
        el.addEventListener("change", updateView);
    });

    logoInput.addEventListener("change", () => {
        logoError.classList.add("hidden");
        logoError.textContent = "";

        const file = logoInput.files[0];
        if (!file) {
            resetLogo(false);
            updateView();
            return;
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            logoError.textContent = "Nicht unterstütztes Dateiformat. Bitte PNG, JPG oder WebP wählen.";
            resetLogo(true);
            updateView();
            return;
        }

        if (file.size > MAX_LOGO_BYTES) {
            logoError.textContent = "Die Logo-Datei ist größer als 2 MB. Bitte eine kleinere Datei wählen.";
            resetLogo(true);
            updateView();
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            logoError.textContent = "Die ausgewählte Datei konnte nicht gelesen werden.";
            resetLogo(true);
            updateView();
        };

        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => {
                logoError.textContent = "Die Bilddatei ist beschädigt oder ungültig.";
                resetLogo(true);
                updateView();
            };
            img.onload = () => {
                if (!loadedLogo) {
                    savedEcLevel = errorCorrectionInput.value;
                }
                loadedLogo = img;
                logoDataUrl = event.target.result;
                clearLogoBtn.classList.remove("hidden");
                ecHint.classList.remove("hidden");
                errorCorrectionInput.value = "H";
                errorCorrectionInput.disabled = true;
                updateView();
            };
            img.src = event.target.result;
        };

        reader.readAsDataURL(file);
    });

    clearLogoBtn.addEventListener("click", () => {
        logoError.classList.add("hidden");
        logoError.textContent = "";
        resetLogo(true);
        updateView();
    });
});