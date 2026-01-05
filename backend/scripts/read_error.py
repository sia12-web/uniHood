with open("verify_error_3.txt", "r", encoding="utf-16") as f:
    lines = f.readlines()
    for line in lines[-20:]:
        print(line.strip())
