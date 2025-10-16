// plugin.js - Website Importer Pro - Optimized with pre-rendered images

console.log("[Importer Pro] Loading...");

penpot.ui.open("Website Importer Pro", "./website-importer-pro/ui.html", {
  width: 500,
  height: 700,
});

console.log("[Importer Pro] UI opened");

function sendToUI(type, data) {
  try {
    penpot.ui.sendMessage({ pluginMessage: { type, ...data } });
  } catch (e) {
    console.error("[Importer Pro] sendToUI error:", e);
  }
}

function rgbToHex(rgbString) {
  if (!rgbString || typeof rgbString !== "string") return "#000000";
  if (rgbString.startsWith("#")) return rgbString;
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#000000";
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function extractColorFromGradient(gradientString) {
  if (!gradientString) return null;
  const match = gradientString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return rgbToHex(`rgb(${match[1]}, ${match[2]}, ${match[3]})`);
  }
  if (gradientString.includes("255, 255, 255")) {
    return "#ffffff";
  }
  return "#71717a";
}

function cleanFontFamily(fontFamilyStr) {
  if (!fontFamilyStr) return "Inter";
  const firstFont = fontFamilyStr.split(",")[0].replace(/['"]/g, "").trim();
  if (firstFont.startsWith("__")) {
    const match = firstFont.match(/__([A-Za-z]+)_/);
    if (match) return match[1];
  }
  const cleaned = firstFont.replace(/_[a-z0-9]+$/i, "");
  return cleaned || "Inter";
}

function normalizeFontWeight(weight) {
  if (!weight) return "400";
  const num = parseInt(weight);
  if (num >= 600) return "700";
  return "400";
}

function determineElementType(node) {
  // Check for pre-rendered image data first
  if (node.imageDataUrl) return "image";
  if (node.tag === "img" || node.src) return "image";
  if (node.tag === "svg" || node.svgDataUrl) return "svg";
  if (node.text && node.text.trim()) return "text";
  return "shape";
}

function flattenStructure(structure, elements = []) {
  console.log("[Flatten] Input structure keys:", Object.keys(structure));
  const sections = [];
  for (const key in structure) {
    if (structure[key] && typeof structure[key] === "object") {
      sections.push(structure[key]);
    }
  }
  console.log("[Flatten] Found", sections.length, "top-level sections");
  sections.forEach((section) => flattenNode(section, elements, 0));
  return elements;
}

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
    imageDataUrl: node.imageDataUrl || null, // Pre-rendered image
    imageData: node.imageData || null,
    svgData: node.svgData || null,
    mime: node.mime || "image/png",
    fills: null,
    fontSize: 16,
    fontFamily: "Inter",
    fontWeight: "400",
    color: "#000000",
    opacity: 1,
    textAlign: "left",
    hasChildren: node.children && node.children.length > 0,
  };

  if (node.styles) {
    if (
      node.styles.backgroundImage &&
      node.styles.backgroundImage.includes("gradient") &&
      (node.styles.color === "rgba(0, 0, 0, 0)" ||
        node.styles.color === "transparent")
    ) {
      element.color = extractColorFromGradient(node.styles.backgroundImage);
    } else if (node.styles.color) {
      element.color = rgbToHex(node.styles.color);
    }

    if (
      node.styles.backgroundColor &&
      node.styles.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      node.styles.backgroundColor !== "transparent"
    ) {
      const hexColor = rgbToHex(node.styles.backgroundColor);
      element.fills = [{ fillColor: hexColor, fillOpacity: 1 }];
    }

    if (node.styles.fontSize) {
      element.fontSize = parseInt(node.styles.fontSize) || 16;
    }
    if (node.styles.fontFamily) {
      element.fontFamily = cleanFontFamily(node.styles.fontFamily);
    }
    if (node.styles.fontWeight) {
      element.fontWeight = normalizeFontWeight(node.styles.fontWeight);
    }
    if (node.styles.opacity) {
      element.opacity = parseFloat(node.styles.opacity) || 1;
    }
    if (node.styles.textAlign) {
      element.textAlign = node.styles.textAlign;
    }
  }

  const isVisible = element.opacity > 0.01;
  const hasMedia =
    element.src ||
    element.svgDataUrl ||
    element.imageData ||
    element.svgData ||
    element.imageDataUrl;
  const hasText = element.text && element.text.trim().length > 0;
  const hasFills = element.fills && element.fills.length > 0;
  const hasReasonableSize = element.width > 10 && element.height > 10;
  const notTooSmall = hasText || element.width * element.height > 100;
  const isBackgroundDiv =
    hasFills && !hasText && !hasMedia && element.hasChildren;

  if (
    isVisible &&
    hasReasonableSize &&
    notTooSmall &&
    !isBackgroundDiv &&
    (hasText || hasMedia || hasFills)
  ) {
    elements.push(element);
  }

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => flattenNode(child, elements, depth + 1));
  }
}

function calculateBoardDimensions(elements) {
  let maxX = 1920;
  let maxY = 1080;
  elements.forEach((el) => {
    const endX = el.x + el.width;
    const endY = el.y + el.height;
    if (endX > maxX) maxX = endX;
    if (endY > maxY) maxY = endY;
  });
  return {
    width: Math.ceil(maxX + 100),
    height: Math.ceil(maxY + 100),
  };
}

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

    const rect = penpot.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width, element.height);
    rect.name = element.name || "Image";

    // Use exact dimensions - image is pre-rendered at correct size
    rect.fills = [
      {
        fillOpacity: 1,
        fillImage: imageMedia,
        keepAspectRatio: false, // Already correct dimensions
      },
    ];

    rect.proportionLock = true;
    return rect;
  } catch (err) {
    console.error("[Importer Pro] Image import error:", err);
    throw err;
  }
}

async function importSVG(imageDataArray, element) {
  console.log(
    "[Importer Pro] Importing SVG (PNG), length:",
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

    const rect = penpot.createRectangle();
    rect.x = element.x;
    rect.y = element.y;
    rect.resize(element.width, element.height);
    rect.name = element.name || "SVG";

    // Use exact dimensions - SVG is pre-rendered at correct size
    rect.fills = [
      {
        fillOpacity: 1,
        fillImage: imageMedia,
        keepAspectRatio: false, // Already correct dimensions
      },
    ];

    rect.proportionLock = true;
    return rect;
  } catch (err) {
    console.error("[Importer Pro] SVG import error:", err);
    throw err;
  }
}

function importText(element) {
  try {
    const text = penpot.createText(element.text || "Text");
    text.x = element.x;
    text.y = element.y;
    text.resize(element.width, element.height);

    let alignmentSuffix = "";
    if (element.textAlign === "center") {
      alignmentSuffix = " [CENTER]";
    } else if (element.textAlign === "right") {
      alignmentSuffix = " [RIGHT]";
    } else if (element.textAlign === "justify") {
      alignmentSuffix = " [JUSTIFY]";
    }

    text.name = (element.name || "Text") + alignmentSuffix;
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

async function importWebsite(data) {
  console.log("[Importer Pro] Starting import...", data);

  if (!penpot.currentPage) {
    throw new Error("No active page found");
  }

  sendToUI("progress", { message: "Processing structure...", percent: 0 });

  let elements = data.elements;
  if (!elements && data.structure) {
    console.log("[Importer Pro] Flattening nested structure...");
    elements = flattenStructure(data.structure);
    console.log("[Importer Pro] Flattened to", elements.length, "elements");
  }

  if (!elements || elements.length === 0) {
    throw new Error("No elements found in data");
  }

  sendToUI("progress", { message: "Calculating dimensions...", percent: 3 });
  const dimensions = calculateBoardDimensions(elements);
  console.log(
    "[Importer Pro] Board dimensions:",
    dimensions.width,
    "x",
    dimensions.height
  );

  sendToUI("progress", { message: "Creating board...", percent: 5 });
  const board = penpot.createBoard();
  board.name = data.metadata?.title || "Imported Website";
  board.resize(dimensions.width, dimensions.height);
  board.x = 0;
  board.y = 0;
  board.fills = [{ fillColor: "#09090b", fillOpacity: 1 }];

  const total = elements.length;
  let completed = 0;
  let imported = 0;
  let textCount = 0;

  console.log("[Importer Pro] Processing", total, "elements");

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
        if (shape) textCount++;
      } else if (element.type === "shape" && element.fills) {
        shape = importShape(element);
      }

      if (shape) {
        board.appendChild(shape);
        imported++;
      }

      completed++;
      if (completed % 100 === 0) {
        console.log(
          "[Importer Pro] Progress:",
          completed,
          "/",
          total,
          "imported:",
          imported,
          "text:",
          textCount
        );
      }
    } catch (err) {
      console.error("[Importer Pro] Element failed:", element.name, err);
    }
  }

  console.log(
    "[Importer Pro] Import complete:",
    imported,
    "elements created (",
    textCount,
    "text)"
  );
  console.log(
    "[Importer Pro] Final board size:",
    dimensions.width,
    "x",
    dimensions.height
  );

  penpot.selection = [board];
  sendToUI("progress", {
    message: `Complete! ${imported} elements imported`,
    percent: 100,
  });
  sendToUI("import-success", { imported: imported, total: total });
}

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
