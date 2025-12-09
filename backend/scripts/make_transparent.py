from PIL import Image

def remove_white_background(input_path, output_path):
    img = Image.open(input_path)
    img = img.convert("RGBA")
    datas = img.getdata()

    newData = []
    for item in datas:
        # Check if pixel is white (or very close to white)
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))  # Transparent
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(output_path, "PNG")
    print(f"Saved transparent image to {output_path}")

if __name__ == "__main__":
    # Input is the original JPG (white bg)
    input_file = r"c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.jpg"
    # Output is the PNG we are using now
    output_file = r"c:\Users\shahb\OneDrive\Desktop\Divan\frontend\public\radius-logo.png"
    remove_white_background(input_file, output_file)
