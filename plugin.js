// plugin.js - Website Importer Pro - FINAL VERSION
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

// Determine element type
function determineElementType(node) {
  if (node.tag === "img" || node.src) return "image";
  if (node.tag === "svg" || node.svgDataUrl) return "svg";
  if (node.text && node.text.trim()) return "text";
  return "shape";
}

// Flatten nested structure into flat elements array
function flattenStructure(structure, elements = []) {
  console.log("[Flatten] Input structure keys:", Object.keys(structure));

  // Handle { nav: {...}, header: {...}, main: {...} } format
  const sections = [];

  for (const key in structure) {
    if (structure[key] && typeof structure[key] === "object") {
      sections.push(structure[key]);
    }
  }

  console.log("[Flatten] Found", sections.length, "top-level sections");

  // Recursively flatten each section
  sections.forEach((section) => flattenNode(section, elements, 0));

  return elements;
}

// Recursively flatten a node
function flattenNode(node, elements, depth) {
  if (!node || depth > 50) return;

  const element = {
    type: determineElementType(node),
    name: node.id || node.tag || "Element",
    x: node.geometry?.x || 0,
    y: node.geometry?.y || 0,
    width: node.geometry?.width || 100,
    height: node.geometry?.height || 100,
    text: node.text || null,
    src: node.src || null,
    svgDataUrl: node.svgDataUrl || null,
    imageData: node.imageData || null,
    svgData: node.svgData || null,
    mime: node.mime || "image/png",
    fills: null,
    fontSize: 16,
    fontFamily: "Inter",
    fontWeight: "400",
    color: "#000000",
    opacity: 1,
  };

  // Parse styles if available
  if (node.styles) {
    if (
      node.styles.backgroundColor &&
      node.styles.backgroundColor !== "rgba(0, 0, 0, 0)"
    ) {
      element.fills = [
        { fillColor: node.styles.backgroundColor, fillOpacity: 1 },
      ];
    }
    if (node.styles.fontSize) {
      element.fontSize = parseInt(node.styles.fontSize) || 16;
    }
    if (node.styles.fontFamily) {
      element.fontFamily = node.styles.fontFamily
        .split(",")[0]
        .replace(/['"]/g, "")
        .trim();
    }
    if (node.styles.fontWeight) {
      element.fontWeight = node.styles.fontWeight;
    }
    if (node.styles.color) {
      element.color = node.styles.color;
    }
    if (node.styles.opacity) {
      element.opacity = parseFloat(node.styles.opacity) || 1;
    }
  }

  // Filter: only add meaningful elements
  const isVisible = element.opacity > 0.01;
  const hasContent =
    element.text ||
    element.src ||
    element.svgDataUrl ||
    element.imageData ||
    element.svgData ||
    (element.fills && element.fills.length > 0);
  const hasReasonableSize = element.width > 5 && element.height > 5;

  if (isVisible && (hasContent || (hasReasonableSize && depth < 3))) {
    elements.push(element);
  }

  // Recurse through children
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => flattenNode(child, elements, depth + 1));
  }
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
  try {
    const text = penpot.createText(element.text || "Text");
    text.x = element.x;
    text.y = element.y;
    text.resize(element.width, element.height);
    text.name = element.name || "Text";

    if (element.fontSize) text.fontSize = element.fontSize;
    if (element.fontFamily) text.fontFamily = element.fontFamily;
    if (element.fontWeight) text.fontWeight = element.fontWeight;
    if (element.color) {
      text.fills = [
        { fillColor: element.color, fillOpacity: element.opacity || 1 },
      ];
    }

    return text;
  } catch (err) {
    console.error("[Importer Pro] Text creation error:", err);
    return null;
  }
}

// Import rectangle/shape
function importShape(element) {
  try {
    const rect = penpot.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width, element.height);
    rect.name = element.name || "Shape";

    if (element.fills && element.fills.length > 0) {
      rect.fills = element.fills;
    }
    if (element.borderRadius) {
      rect.borderRadius = element.borderRadius;
    }

    return rect;
  } catch (err) {
    console.error("[Importer Pro] Shape creation error:", err);
    return null;
  }
}

// Main import handler
async function importWebsite(data) {
  console.log("[Importer Pro] Starting import...", data);

  if (!penpot.currentPage) {
    throw new Error("No active page found");
  }

  sendToUI("progress", { message: "Processing structure...", percent: 0 });

  // Flatten nested structure
  let elements = data.elements;
  if (!elements && data.structure) {
    console.log("[Importer Pro] Flattening nested structure...");
    elements = flattenStructure(data.structure);
    console.log("[Importer Pro] Flattened to", elements.length, "elements");
  }

  if (!elements || elements.length === 0) {
    throw new Error("No elements found in data");
  }

  sendToUI("progress", { message: "Creating board...", percent: 5 });

  // Create board
  const board = penpot.createBoard();
  board.name = data.metadata?.title || "Imported Website";

  const width = data.metadata?.viewport?.width || data.metadata?.width || 1920;
  const height =
    data.metadata?.viewport?.height || data.metadata?.height || 1080;

  board.resize(width, height);
  board.x = 0;
  board.y = 0;
  board.fills = [{ fillColor: "#ffffff", fillOpacity: 1 }];

  const total = elements.length;
  let completed = 0;
  let imported = 0;

  console.log("[Importer Pro] Processing", total, "elements");

  // Process each element
  for (const element of elements) {
    try {
      let shape = null;

      if (element.type === "image" && element.imageData) {
        sendToUI("progress", {
          message: `Importing image: ${element.name}`,
          percent: 10 + (completed / total) * 85,
        });
        shape = await importImage(element.imageData, element.mime, element);
      } else if (element.type === "svg" && element.svgData) {
        sendToUI("progress", {
          message: `Importing SVG: ${element.name}`,
          percent: 10 + (completed / total) * 85,
        });
        shape = await importSVG(element.svgData, element);
      } else if (element.type === "text" && element.text) {
        sendToUI("progress", {
          message: `Creating text: ${element.name}`,
          percent: 10 + (completed / total) * 85,
        });
        shape = importText(element);
      } else if (element.type === "shape" && element.fills) {
        shape = importShape(element);
      }

      if (shape) {
        board.appendChild(shape);
        imported++;
      }

      completed++;

      // Log progress every 100 elements
      if (completed % 100 === 0) {
        console.log(
          "[Importer Pro] Progress:",
          completed,
          "/",
          total,
          "imported:",
          imported
        );
      }
    } catch (err) {
      console.error("[Importer Pro] Element failed:", element.name, err);
    }
  }

  console.log("[Importer Pro] Import complete:", imported, "elements created");

  penpot.selection = [board];
  sendToUI("progress", {
    message: `Complete! ${imported} elements imported`,
    percent: 100,
  });
  sendToUI("import-success", { imported: imported, total: total });
}

// Message handler
penpot.ui.onMessage(async (message) => {
  const msg = message.pluginMessage || message;

  console.log("[Importer Pro] Received message type:", msg.type);

  if (msg.type === "import-website") {
    try {
      await importWebsite(msg.data);
    } catch (err) {
      console.error("[Importer Pro] Import error:", err);
      sendToUI("import-error", { error: err.message });
    }
  }
});

console.log("[Importer Pro] Ready");
