# University Logos

This directory contains logo files for all supported universities.

## Current Logos

| University | File | Format | Size | Usage |
|------------|------|--------|------|-------|
| McGill University | `mcgill.svg` | SVG | 2.1 KB | Legacy/vector format |
| McGill University | `mcgill.png` | PNG | 51.5 KB | High-quality raster with shield |
| Concordia University | `concordia.png` | PNG | 19.3 KB | Primary logo |

**Note**: McGill has both SVG and PNG versions. The PNG version (`mcgill.png`) is recommended for consistency with the shield emblem and wordmark.

## File Naming Convention

- **Format**: `{university-slug}.{ext}`
- **Examples**: 
  - `mcgill.svg`
  - `concordia.png`
  - `uoft.svg`
  - `ubc.png`

**University Slug Rules**:
- All lowercase
- Use full university name or common abbreviation
- No spaces (use hyphens if needed)
- Examples: `mcgill`, `concordia`, `uoft`, `ubc`, `mit`, etc.

## Supported Formats

- **SVG** (Preferred) - Scalable, smaller file size
- **PNG** - Good for complex logos, use high resolution (min 512x512px)
- **WEBP** - Also supported

## Logo Requirements

### Size
- **Minimum**: 256x256 pixels
- **Recommended**: 512x512 pixels
- **For SVG**: Any size (vector format)

### Background
- Transparent background preferred
- If not possible, use white background

### Colors
- Use official university brand colors
- Ensure good contrast for readability

## Adding a New University Logo

### 1. Prepare the Logo
- Download official logo from university website
- Ensure it meets size requirements
- Convert to SVG if possible for best quality

### 2. Save the File
Place the logo in this directory with the naming convention:
```
frontend/public/university-logos/{university-slug}.{ext}
```

### 3. Update Database
Update the `logo_url` in the database:
```sql
UPDATE campuses 
SET logo_url = '/university-logos/concordia.png'
WHERE name = 'Concordia University';
```

**Note**: The path is relative to the `public/` directory. Next.js automatically serves files from `public/` at the root URL.

### 4. Test
- Verify the logo appears in the CampusLogoBadge component
- Check that it displays correctly on both light and dark backgrounds
- Test at different screen sizes

## Usage in Code

The logos are automatically loaded via the `CampusLogoBadge` component:

```tsx
<CampusLogoBadge 
  campusName="Concordia University" 
  logoUrl="/university-logos/concordia.png" 
/>
```

The component:
- Displays the logo if `logoUrl` is provided
- Falls back to initials if no logo is available
- Handles both SVG and raster formats

## Logo Sources

| University | Logo Source |
|------------|-------------|
| McGill | Official McGill brand guidelines |
| Concordia | Official Concordia brand guidelines |

**Important**: Only use official university logos with permission. Respect trademark and copyright laws.

## File Size Optimization

### For PNG files:
```bash
# Use a tool like pngcrush or imagemagick
pngcrush -rem alla -reduce concordia.png concordia-optimized.png

# Or with imagemagick
convert concordia.png -strip -quality 85 concordia-optimized.png
```

### For SVG files:
```bash
# Use SVGO
npx svgo mcgill.svg
```

### For WEBP conversion:
```bash
# Convert PNG to WEBP
cwebp concordia.png -o concordia.webp
```

## Directory Structure

```
frontend/public/university-logos/
├── README.md              # This file
├── mcgill.svg            # McGill University logo (SVG, 2.1 KB)
├── mcgill.png            # McGill University logo (PNG, 51.5 KB)
├── concordia.png         # Concordia University logo (PNG, 19.3 KB)
├── uoft.svg              # (Future) University of Toronto
├── ubc.png               # (Future) UBC
└── ...                   # Additional universities
```

## Common Issues

### Logo not displaying
- Check the file path is correct
- Verify the file exists in `public/university-logos/`
- Check browser console for 404 errors
- Ensure database `logo_url` matches the file path

### Logo looks pixelated
- Use higher resolution PNG (at least 512x512)
- Or convert to SVG format

### Logo has wrong colors
- Check if you downloaded the correct brand version
- Some universities have multiple logo variants (primary, alternate, stacked)

## Future Enhancements

- [ ] Automated logo optimization pipeline
- [ ] Dark mode variants for logos
- [ ] Multiple logo sizes (icon, small, medium, large)
- [ ] Logo CDN integration for production
