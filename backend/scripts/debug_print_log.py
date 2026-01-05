with open("verify_error_6.txt", "rb") as f:
    f.seek(0, 2) # end
    size = f.tell()
    f.seek(max(0, size - 3000), 0)
    data = f.read()
    # Decode utf-16-le ignoring errors
    decoded = data.decode("utf-16-le", errors="ignore")
    print(decoded)
