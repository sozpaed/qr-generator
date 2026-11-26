import base64
import io
from flask import Flask, jsonify, render_template_string, request
from PIL import Image
import qrcode

app = Flask(__name__)

ERROR_CORRECTION_MAP = {
    "L": qrcode.constants.ERROR_CORRECT_L,  # ~7 % Fehlertoleranz
    "M": qrcode.constants.ERROR_CORRECT_M,  # ~15 % Fehlertoleranz
    "Q": qrcode.constants.ERROR_CORRECT_Q,  # ~25 % Fehlertoleranz
    "H": qrcode.constants.ERROR_CORRECT_H,  # ~30 % Fehlertoleranz
}

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QR-Code Generator</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 500px; margin: 3rem auto; padding: 0 1rem; color: #1f2937; }
        h1 { text-align: center; margin-bottom: 1.5rem; }
        input[type="url"] { width: 100%; padding: 0.75rem; font-size: 1rem; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; margin-bottom: 1rem; }
        .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: #f9fafb; padding: 1rem; border-radius: 10px; border: 1px solid #e5e7eb; text-align: left; }
        .control-group { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.875rem; font-weight: 600; }
        .full-width { grid-column: 1 / -1; }
        .logo-row { display: flex; gap: 0.5rem; align-items: center; }
        input[type="color"] { width: 100%; height: 38px; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #fff; padding: 2px; }
        input[type="file"] { font-size: 0.85rem; flex: 1; }
        select, input[type="range"] { width: 100%; height: 38px; border-radius: 6px; border: 1px solid #d1d5db; padding: 0 0.5rem; background: #fff; }
        button.clear-btn { padding: 0.4rem 0.75rem; font-size: 0.8rem; background: #ef4444; color: #fff; border: none; border-radius: 6px; cursor: pointer; display: none; }
        .preview { margin: 1.5rem 0; min-height: 240px; display: flex; align-items: center; justify-content: center; border: 2px dashed #e5e7eb; border-radius: 12px; padding: 1rem; overflow: auto; }
        img { max-width: 100%; height: auto; border-radius: 4px; }
        .actions { text-align: center; }
        a.btn { display: inline-block; padding: 0.75rem 1.5rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
        a.btn.disabled { background: #9ca3af; pointer-events: none; }
    </style>
</head>
<body>
    <h1>QR-Code Generator</h1>
    <input type="url" id="urlInput" placeholder="https://www.beispiel.de" autofocus>

    <div class="controls">
        <div class="control-group">
            <label for="fillColor">Vordergrundfarbe</label>
            <input type="color" id="fillColor" value="#000000">
        </div>
        <div class="control-group">
            <label for="backColor">Hintergrundfarbe</label>
            <input type="color" id="backColor" value="#ffffff">
        </div>
        <div class="control-group">
            <label for="boxSize">Kästchengröße: <span id="boxSizeVal">10</span> px</label>
            <input type="range" id="boxSize" min="5" max="20" value="10">
        </div>
        <div class="control-group">
            <label for="errorCorrection">Fehlerkorrektur</label>
            <select id="errorCorrection">
                <option value="L">L – Niedrig (7 %)</option>
                <option value="M" selected>M – Mittel (15 %)</option>
                <option value="Q">Q – Hoch (25 %)</option>
                <option value="H">H – Maximal (30 %)</option>
            </select>
        </div>
        <div class="control-group full-width">
            <label for="logoInput">Eigenes Logo (optional, PNG/JPG/WebP)</label>
            <div class="logo-row">
                <input type="file" id="logoInput" accept="image/png, image/jpeg, image/webp">
                <button type="button" id="clearLogoBtn" class="clear-btn">Entfernen</button>
            </div>
        </div>
    </div>

    <div class="preview" id="previewBox">
        <span style="color:#6b7280;">Link eingeben für Live-Vorschau</span>
    </div>

    <div class="actions">
        <a id="downloadBtn" class="btn disabled" download="qrcode.png">PNG herunterladen</a>
    </div>

    <script>
        const urlInput = document.getElementById('urlInput');
        const fillColor = document.getElementById('fillColor');
        const backColor = document.getElementById('backColor');
        const boxSize = document.getElementById('boxSize');
        const boxSizeVal = document.getElementById('boxSizeVal');
        const errorCorrection = document.getElementById('errorCorrection');
        const logoInput = document.getElementById('logoInput');
        const clearLogoBtn = document.getElementById('clearLogoBtn');
        const preview = document.getElementById('previewBox');
        const downloadBtn = document.getElementById('downloadBtn');

        let logoBase64 = null;
        let timer;

        function scheduleUpdate() {
            boxSizeVal.textContent = boxSize.value;
            clearTimeout(timer);
            timer = setTimeout(updateQR, 200);
        }

        [urlInput, fillColor, backColor, boxSize, errorCorrection].forEach(el => {
            el.addEventListener('input', scheduleUpdate);
            el.addEventListener('change', scheduleUpdate);
        });

        logoInput.addEventListener('change', () => {
            const file = logoInput.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                logoBase64 = e.target.result;
                clearLogoBtn.style.display = 'inline-block';
                // Hohe Fehlerkorrektur für bessere Lesbarkeit mit Logo aktivieren
                errorCorrection.value = 'H';
                scheduleUpdate();
            };
            reader.readAsDataURL(file);
        });

        clearLogoBtn.addEventListener('click', () => {
            logoInput.value = '';
            logoBase64 = null;
            clearLogoBtn.style.display = 'none';
            scheduleUpdate();
        });

        async function updateQR() {
            const url = urlInput.value.trim();
            if (!url) {
                preview.innerHTML = '<span style="color:#6b7280;">Link eingeben für Live-Vorschau</span>';
                downloadBtn.classList.add('disabled');
                downloadBtn.removeAttribute('href');
                return;
            }
            const res = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: url,
                    fill_color: fillColor.value,
                    back_color: backColor.value,
                    box_size: parseInt(boxSize.value, 10),
                    error_correction: errorCorrection.value,
                    logo: logoBase64
                })
            });
            const data = await res.json();
            preview.innerHTML = `<img src="${data.image}" alt="QR-Code">`;
            downloadBtn.href = data.image;
            downloadBtn.classList.remove('disabled');
        }
    </script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route("/generate", methods=["POST"])
def generate():
    data = request.json or {}
    url = data.get("url", "")
    fill_color = data.get("fill_color", "black")
    back_color = data.get("back_color", "white")
    box_size = max(4, min(25, int(data.get("box_size", 10))))
    logo_data = data.get("logo")

    # Mit Logo mindestens Stufe H erzwingen, damit der Code scanbar bleibt
    if logo_data:
        ec_level = qrcode.constants.ERROR_CORRECT_H
    else:
        ec_level = ERROR_CORRECTION_MAP.get(
            data.get("error_correction", "M"),
            qrcode.constants.ERROR_CORRECT_M
        )

    qr = qrcode.QRCode(
        version=1,
        error_correction=ec_level,
        box_size=box_size,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color=fill_color, back_color=back_color).convert("RGBA")

    if logo_data:
        try:
            if "," in logo_data:
                logo_data = logo_data.split(",", 1)[1]
            logo_bytes = base64.b64decode(logo_data)
            logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")

            # Logo proportional auf maximal 22 % der QR-Code-Breite skalieren
            qr_width, qr_height = img.size
            max_logo_size = int(qr_width * 0.22)
            logo.thumbnail((max_logo_size, max_logo_size), Image.Resampling.LANCZOS)

            # Schützenden Rand in der Hintergrundfarbe hinter das Logo legen
            pad = max(4, box_size // 2)
            bg_size = (logo.width + pad * 2, logo.height + pad * 2)
            logo_bg = Image.new("RGBA", bg_size, back_color)
            logo_bg.paste(logo, (pad, pad), mask=logo)

            # Logo mittig auf den QR-Code setzen
            pos = ((qr_width - bg_size[0]) // 2, (qr_height - bg_size[1]) // 2)
            img.paste(logo_bg, pos, mask=logo_bg)
        except Exception:
            pass

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return jsonify({"image": f"data:image/png;base64,{encoded}"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)