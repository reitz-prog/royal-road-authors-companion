# Author's Companion

A Chrome extension that provides a calendar-based shoutout swap scheduler for Royal Road authors.

## Features

- Calendar-based scheduling for shoutout swaps
- Integration with Royal Road author dashboard
- Chapter page support

## Installation

**Coming soon to the Chrome Web Store.**

### Manual Installation

1. Download the latest release from [Releases](../../releases) or download the repository as a ZIP
2. Extract the ZIP file
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in the top right)
5. Click "Load unpacked"
6. Select the extracted folder

### Building from Source

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome as described above

## Development

Run the development build with watch mode:
```bash
npm run dev
```

## Tutorial

### Calendar

![Calendar](assets/calendar-example.png)

The calendar is where you can schedule shoutouts. Click on an empty date and a modal will appear.

### Adding a Shoutout

![Add Shoutout Modal](assets/add-shoutout-modal.png)

Paste a Royal Road fiction link and it will render a preview. You can preview it, then click "Add" to save.

### Shoutout Code

![Added Code](assets/added-code.png)

Once saved, the corresponding shoutout code is generated.

### Drafts Integration

![Drafts](assets/drafts.png)

Depending on the date, the shoutout code will be available directly from your drafts and you can insert it. The extension also automatically detects when a shoutout has been posted and will archive it.

### Check Swaps

You can scan your whole calendar for people who have swapped you back.

### Messaging

You can message people directly after the swap.

### Drag and Drop

Drag a shoutout from one date to another on the calendar to reschedule it.

### Import / Export

The extension supports importing and exporting your shoutout data in Excel format. The only required fields are `code` and `date`.

### Analytics

Track your fiction's followers and favorites over time. View data in tables (daily, last 24 hours, hourly) or graphs (daily, weekly, by day of week, by hour of day). Supports timezone selection and CSV export.

## Tech Stack

- Preact
- Goober (CSS-in-JS)
- esbuild
- Chrome Extension Manifest V3
