import qrcode


def erstelle_qr_code(url: str, dateiname: str = "qrcode.png") -> None:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    bild = qr.make_image(fill_color="black", back_color="white")
    bild.save(dateiname)
    print(f"QR-Code gespeichert unter: {dateiname}")


if __name__ == "__main__":
    link = input("Bitte Link eingeben (z. B. https://example.com): ").strip()
    if link:
        erstelle_qr_code(link)