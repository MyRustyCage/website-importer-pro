// plugin.js - Unified Website Importer Pro
console.log("[Importer Pro] Loading...");

penpot.ui.open("Website Importer Pro", "./website-importer-pro/ui.html", {
  width: 500,
  height: 700,
});

console.log("[Importer Pro] UI opened");

// Send messages to UI
function sendToUI(type, data) {
  try {
    penpot.ui.sendMessage({ pluginMessage: { type, ...data } });
  } catch (e) {
    console.error("[Importer Pro] sendToUI error:", e);
  }
}

// Manual string to bytes conversion
function stringToUint8Array(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const len = utf8.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
}

// Import image from array data
async function importImage(imageDataArray, mime, element) {
  console.log(
    "[Importer Pro] Importing image:",
    mime,
    imageDataArray.length,
    "bytes"
  );

  try {
    const uint8 = new Uint8Array(imageDataArray);
    const imageMedia = await penpot.uploadMediaData("image", uint8, mime);

    if (!imageMedia || !imageMedia.id) {
      throw new Error("Image upload failed - no media ID");
    }

    console.log("[Importer Pro] Image uploaded:", imageMedia.id);

    const rect = penpot.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width, element.height);
    rect.name = element.name || "Image";
    rect.fills = [{ fillOpacity: 1, fillImage: imageMedia }];

    return rect;
  } catch (err) {
    console.error("[Importer Pro] Image import error:", err);
    throw err;
  }
}

// Import SVG as PNG
async function importSVG(imageDataArray, element) {
  console.log(
    "[Importer Pro] Importing SVG PNG, length:",
    imageDataArray.length
  );

  try {
    const uint8 = new Uint8Array(imageDataArray);
    const imageMedia = await penpot.uploadMediaData(
      "image",
      uint8,
      "image/png"
    );

    if (!imageMedia || !imageMedia.id) {
      throw new Error("SVG upload failed - no media ID");
    }

    console.log("[Importer Pro] SVG uploaded:", imageMedia.id);

    const rect = penpot.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width, element.height);
    rect.name = element.name || "SVG";
    rect.fills = [{ fillOpacity: 1, fillImage: imageMedia }];

    return rect;
  } catch (err) {
    console.error("[Importer Pro] SVG import error:", err);
    throw err;
  }
}

// Import text element
function importText(element) {
  const text = penpot.createText(element.text || "Text");
  text.x = element.x;
  text.y = element.y;
  text.resize(element.width, element.height);
  text.name = element.name || "Text";

  if (element.fontSize) text.fontSize = element.fontSize;
  if (element.fontFamily) text.fontFamily = element.fontFamily;
  if (element.fontWeight) text.fontWeight = element.fontWeight;
  if (element.color)
    text.fills = [
      { fillColor: element.color, fillOpacity: element.opacity || 1 },
    ];

  return text;
}

// Import rectangle/shape
function importShape(element) {
  const rect = penpot.createRectangle();
  rect.x = element.x;
  rect.y = element.y;
  rect.resize(element.width, element.height);
  rect.name = element.name || "Shape";

  if (element.fills) rect.fills = element.fills;
  if (element.borderRadius) rect.borderRadius = element.borderRadius;

  return rect;
}

// Main import handler
async function importWebsite(data) {
  console.log("[Importer Pro] Starting import...", data);

  if (!penpot.currentPage) {
    throw new Error("No active page found");
  }

  sendToUI("progress", { message: "Creating board...", percent: 0 });

  const board = penpot.createBoard();
  board.name = data.metadata?.title || "Imported Website";
  board.resize(data.metadata?.width || 1920, data.metadata?.height || 1080);
  board.x = 0;
  board.y = 0;
  board.fills = [{ fillColor: "#09090b", fillOpacity: 1 }];

  const elements = data.elements || [];
  const total = elements.length;
  let completed = 0;

  for (const element of elements) {
    try {
      let shape = null;

      if (element.type === "image" && element.imageData) {
        sendToUI("progress", {
          message: `Importing image: ${element.name}`,
          percent: (completed / total) * 100,
        });
        shape = await importImage(element.imageData, element.mime, element);
      } else if (element.type === "svg" && element.svgData) {
        sendToUI("progress", {
          message: `Importing SVG: ${element.name}`,
          percent: (completed / total) * 100,
        });
        shape = await importSVG(element.svgData, element);
      } else if (element.type === "text") {
        sendToUI("progress", {
          message: `Creating text: ${element.name}`,
          percent: (completed / total) * 100,
        });
        shape = importText(element);
      } else {
        sendToUI("progress", {
          message: `Creating shape: ${element.name}`,
          percent: (completed / total) * 100,
        });
        shape = importShape(element);
      }

      if (shape) {
        board.appendChild(shape);
      }

      completed++;
    } catch (err) {
      console.error("[Importer Pro] Element import failed:", element.name, err);
    }
  }

  penpot.selection = [board];
  sendToUI("progress", { message: "Import complete!", percent: 100 });
  sendToUI("import-success", {});
}

// Message handler - FIXED
penpot.ui.onMessage(async (message) => {
  // The message structure from parent.postMessage
  const msg = message.pluginMessage || message;

  console.log("[Importer Pro] Received message type:", msg.type);

  if (msg.type === "import-website") {
    try {
      await importWebsite(msg.data);
    } catch (err) {
      console.error("[Importer Pro] Import error:", err);
      sendToUI("import-error", { error: err.message });
    }
  } else if (msg.type === "import-image") {
    try {
      await importImage(msg.imageData, msg.mime, msg.element);
      sendToUI("import-success", {});
    } catch (err) {
      sendToUI("import-error", { error: err.message });
    }
  } else if (msg.type === "import-svg") {
    try {
      await importSVG(msg.svgData, msg.element);
      sendToUI("import-success", {});
    } catch (err) {
      sendToUI("import-error", { error: err.message });
    }
  }
});

console.log("[Importer Pro] Ready");
