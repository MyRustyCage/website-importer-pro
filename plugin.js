// Enhanced Website Importer - Real Images & SVGs
penpot.ui.open("Website Importer Pro", "./website-importer-pro/ui.html", {
  width: 500,
  height: 700,
});

// Send message to UI
function sendToUI(type, data) {
  try {
    penpot.ui.sendMessage({ type, ...data });
  } catch (e) {
    console.error("[Plugin] sendToUI error:", e);
  }
}

penpot.ui.onMessage(async (message) => {
  if (message.type === "import-website") {
    const data = message.data;
    if (!data) return;

    try {
      await importWebsite(data);
      penpot.ui.sendMessage({ type: "import-success" });
    } catch (error) {
      penpot.ui.sendMessage({
        type: "import-error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});

// Check if element should be imported
function shouldImportElement(element) {
  return !!(
    (element.text && element.text.trim().length > 0) ||
    (element.styles.backgroundColor &&
      element.styles.backgroundColor !== "rgba(0, 0, 0, 0)") ||
    (element.styles.backgroundImage &&
      element.styles.backgroundImage !== "none") ||
    (element.styles.boxShadow && element.styles.boxShadow !== "none") ||
    (element.styles.borderRadius &&
      element.styles.borderRadius !== "0px" &&
      parseInt(element.styles.borderRadius) > 0) ||
    [
      "img",
      "svg",
      "button",
      "a",
      "input",
      "textarea",
      "video",
      "body",
      "main",
      "section",
      "header",
      "footer",
      "nav",
      "article",
      "aside",
    ].includes(element.tag) ||
    element.src ||
    element.svgDataUrl ||
    (element.geometry.width > 300 && element.geometry.height > 300)
  );
}

// Flatten structure
function flattenElements(data) {
  const elements = [];

  function traverse(element) {
    if (!element) return;
    if (shouldImportElement(element)) {
      elements.push(element);
    }
    if (element.children) {
      element.children.forEach((child) => traverse(child));
    }
  }

  traverse(data.structure.nav);
  traverse(data.structure.header);
  traverse(data.structure.main);
  data.structure.sections?.forEach((section) => traverse(section));
  traverse(data.structure.footer);

  return elements;
}

// Calculate board dimensions
function calculateDimensions(elements) {
  let maxX = 0,
    maxY = 0;
  elements.forEach((el) => {
    const endX = el.geometry.x + el.geometry.width;
    const endY = el.geometry.y + el.geometry.height;
    if (endX > maxX) maxX = endX;
    if (endY > maxY) maxY = endY;
  });
  return {
    width: Math.max(maxX, 1920),
    height: Math.max(maxY, 1080),
  };
}

// Color utilities
function rgbToHex(rgbStr) {
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return rgbStr;
}

function extractOpacity(rgbaStr) {
  const match = rgbaStr.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
  return match ? parseFloat(match[1]) : 1;
}

// Parse gradient (keeping original logic)
function parseGradient(backgroundImage) {
  const linearMatch = backgroundImage.match(/linear-gradient\(([^)]+)\)/);
  const radialMatch = backgroundImage.match(/radial-gradient\(([^)]+)\)/);

  if (!linearMatch && !radialMatch) return null;

  const isLinear = !!linearMatch;
  const content = isLinear ? linearMatch[1] : radialMatch[1];
  const parts = content.split(",").map((p) => p.trim());

  const stops = parts
    .map((part) => {
      const colorMatch = part.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
      if (!colorMatch) return null;

      const color = rgbToHex(colorMatch[1]);
      const opacity = extractOpacity(colorMatch[1]);
      const offsetMatch = part.match(/(\d+(?:\.\d+)?)%/);
      const offset = offsetMatch ? parseFloat(offsetMatch[1]) / 100 : null;

      return { color, offset, opacity };
    })
    .filter(Boolean);

  if (stops.length === 0) return null;

  if (isLinear) {
    return {
      type: "linear",
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 1,
      width: 1,
      stops: stops.map((s) => ({
        color: s.color,
        offset: s.offset,
        opacity: s.opacity,
      })),
    };
  } else {
    return {
      type: "radial",
      startX: 0.5,
      startY: 0.5,
      endX: 1,
      endY: 0.5,
      width: 1,
      stops: stops.map((s) => ({
        color: s.color,
        offset: s.offset,
        opacity: s.opacity,
      })),
    };
  }
}

// Generate element name
function generateName(element) {
  if (element.id && element.id.trim().length > 0) return element.id;
  if (element.text && element.text.length > 0 && element.text.length < 30) {
    return `${element.tag}: ${element.text.substring(0, 20)}`;
  }
  return element.tag;
}

// Create Penpot element
async function createElement(element, imageCache = {}) {
  const zIndex =
    element.styles.zIndex && element.styles.zIndex !== "auto"
      ? parseInt(element.styles.zIndex)
      : 0;

  // Handle images - ENHANCED
  if (element.tag === "img" && element.src) {
    console.log("[Image] Processing:", element.src);

    // Check cache
    if (imageCache[element.src]) {
      console.log("[Image] Using cached image");
      const rect = penpot.createRectangle();
      rect.x = element.geometry.x;
      rect.y = element.geometry.y;
      rect.resize(element.geometry.width, element.geometry.height);
      rect.name = generateName(element);
      rect.fills = [{ fillOpacity: 1, fillImage: imageCache[element.src] }];
      return { element: rect, isText: false, zIndex };
    }

    // Try to fetch and import
    try {
      sendToUI("progress", {
        message: `Fetching image: ${element.src.substring(0, 50)}...`,
      });

      const imageData = await fetchImageFromUI(element.src);
      if (imageData && imageData.uint8Array) {
        const uint8 = new Uint8Array(imageData.uint8Array);
        const mime = imageData.mime || "image/png";

        const imageMedia = await penpot.uploadMediaData("image", uint8, mime);

        if (imageMedia && imageMedia.id) {
          imageCache[element.src] = imageMedia;

          const rect = penpot.createRectangle();
          rect.x = element.geometry.x;
          rect.y = element.geometry.y;
          rect.resize(element.geometry.width, element.geometry.height);
          rect.name = generateName(element);
          rect.fills = [{ fillOpacity: 1, fillImage: imageMedia }];

          console.log("[Image] ✓ Imported:", element.src);
          return { element: rect, isText: false, zIndex };
        }
      }
    } catch (err) {
      console.error("[Image] Failed:", element.src, err);
    }

    // Fallback to placeholder
    const rect = penpot.createRectangle();
    rect.x = element.geometry.x;
    rect.y = element.geometry.y;
    rect.resize(element.geometry.width, element.geometry.height);
    rect.name = `${generateName(element)} [IMG - Fetch Failed]`;
    rect.fills = [{ fillColor: "#CCCCCC", fillOpacity: 0.3 }];
    rect.strokes = [
      { strokeColor: "#FF6B6B", strokeWidth: 2, strokeOpacity: 0.5 },
    ];
    return { element: rect, isText: false, zIndex };
  }

  // Handle SVGs - ENHANCED
  if (element.tag === "svg" && element.svgDataUrl) {
    console.log("[SVG] Processing SVG");

    try {
      sendToUI("progress", { message: "Cleaning SVG..." });

      // Request UI to clean and convert SVG
      const svgData = await cleanSVGFromUI(element.svgDataUrl);
      if (svgData && svgData.uint8Array) {
        const uint8 = new Uint8Array(svgData.uint8Array);
        const imageMedia = await penpot.uploadMediaData(
          "image",
          uint8,
          "image/png"
        );

        if (imageMedia && imageMedia.id) {
          const rect = penpot.createRectangle();
          rect.x = element.geometry.x;
          rect.y = element.geometry.y;
          rect.resize(element.geometry.width, element.geometry.height);
          rect.name = generateName(element);
          rect.fills = [{ fillOpacity: 1, fillImage: imageMedia }];

          console.log("[SVG] ✓ Imported");
          return { element: rect, isText: false, zIndex };
        }
      }
    } catch (err) {
      console.error("[SVG] Failed:", err);
    }

    // Fallback to placeholder
    const rect = penpot.createRectangle();
    rect.x = element.geometry.x;
    rect.y = element.geometry.y;
    rect.resize(element.geometry.width, element.geometry.height);
    rect.name = `${generateName(element)} [SVG - Clean Failed]`;
    rect.fills = [{ fillColor: "#FFFFFF", fillOpacity: 0.05 }];
    rect.strokes = [
      { strokeColor: "#22D3EE", strokeWidth: 1, strokeOpacity: 0.2 },
    ];
    return { element: rect, isText: false, zIndex };
  }

  // Handle text (original logic)
  if (element.text && element.text.trim().length > 0) {
    const text = penpot.createText(element.text);
    text.x = element.geometry.x;
    text.y = element.geometry.y;
    text.resize(element.geometry.width, element.geometry.height);
    text.name = generateName(element);

    const fontSize = parseInt(element.styles.fontSize);
    if (!isNaN(fontSize) && fontSize > 0) text.fontSize = fontSize.toString();

    try {
      text.fontFamily =
        element.styles.fontFamily.split(",")[0].replace(/["']/g, "").trim() ||
        "Work Sans";
    } catch {
      text.fontFamily = "Work Sans";
    }

    const color = rgbToHex(element.styles.color);
    const opacity = extractOpacity(element.styles.color);
    text.fills = [{ fillColor: color, fillOpacity: opacity }];

    return { element: text, isText: true, zIndex };
  }

  // Handle shapes (original logic with gradients)
  const rect = penpot.createRectangle();
  rect.x = element.geometry.x;
  rect.y = element.geometry.y;
  rect.resize(element.geometry.width, element.geometry.height);
  rect.name = generateName(element);

  if (
    element.styles.backgroundImage &&
    element.styles.backgroundImage.includes("gradient")
  ) {
    const gradient = parseGradient(element.styles.backgroundImage);
    if (gradient) {
      rect.fills = [{ fillColorGradient: gradient }];
      return { element: rect, isText: false, zIndex };
    }
  }

  if (
    element.styles.backgroundColor &&
    element.styles.backgroundColor !== "rgba(0, 0, 0, 0)"
  ) {
    const color = rgbToHex(element.styles.backgroundColor);
    const opacity = extractOpacity(element.styles.backgroundColor);
    rect.fills = [{ fillColor: color, fillOpacity: opacity }];
  }

  if (element.styles.borderRadius && element.styles.borderRadius !== "0px") {
    const radius = parseInt(element.styles.borderRadius);
    if (!isNaN(radius) && radius > 0) rect.borderRadius = radius;
  }

  return { element: rect, isText: false, zIndex };
}

// Request image from UI
async function fetchImageFromUI(url) {
  return new Promise((resolve) => {
    const messageHandler = (event) => {
      if (event.data && event.data.type === "image-fetched") {
        penpot.ui.removeEventListener("message", messageHandler);
        resolve(event.data.data);
      }
    };

    penpot.ui.addEventListener("message", messageHandler);
    sendToUI("fetch-image", { url });

    // Timeout after 10 seconds
    setTimeout(() => {
      penpot.ui.removeEventListener("message", messageHandler);
      resolve(null);
    }, 10000);
  });
}

// Request SVG cleaning from UI
async function cleanSVGFromUI(svgDataUrl) {
  return new Promise((resolve) => {
    const messageHandler = (event) => {
      if (event.data && event.data.type === "svg-cleaned") {
        penpot.ui.removeEventListener("message", messageHandler);
        resolve(event.data.data);
      }
    };

    penpot.ui.addEventListener("message", messageHandler);
    sendToUI("clean-svg", { svgDataUrl });

    setTimeout(() => {
      penpot.ui.removeEventListener("message", messageHandler);
      resolve(null);
    }, 10000);
  });
}

// Main import function
async function importWebsite(data) {
  if (!penpot.currentPage) throw new Error("No active page found");

  const elements = flattenElements(data);
  const dimensions = calculateDimensions(elements);

  const board = penpot.createBoard();
  board.name = data.metadata.title || "Imported Website";
  board.resize(dimensions.width, dimensions.height);
  board.x = 0;
  board.y = 0;
  board.fills = [{ fillColor: "#09090b", fillOpacity: 1 }];

  const created = [];
  const imageCache = {};
  const batchSize = 50;

  // Process in batches
  for (let i = 0; i < elements.length; i += batchSize) {
    const batch = elements.slice(i, i + batchSize);

    for (const element of batch) {
      try {
        const result = await createElement(element, imageCache);
        if (result) created.push({ ...result, sourceElement: element });
      } catch (err) {
        console.error("[Import] Failed:", element.id, err);
      }
    }

    sendToUI("progress", {
      message: `Processing ${i + batch.length} / ${elements.length}...`,
      percent: ((i + batch.length) / elements.length) * 100,
    });
  }

  // Sort by z-index and size (original logic)
  created.sort((a, b) => {
    if (a.isText !== b.isText) return a.isText ? 1 : -1;
    if (!a.isText && !b.isText) {
      const aSize =
        a.sourceElement.geometry.width * a.sourceElement.geometry.height;
      const bSize =
        b.sourceElement.geometry.width * b.sourceElement.geometry.height;
      const fullSize = 1920 * 1080;
      const aIsLarge = aSize > fullSize * 0.5;
      const bIsLarge = bSize > fullSize * 0.5;

      if (aIsLarge && !bIsLarge) return -1;
      if (bIsLarge && !aIsLarge) return 1;
      if (Math.abs(aSize - bSize) > 100000) return aSize - bSize;
    }
    return a.zIndex - b.zIndex;
  });

  created.forEach((item) => board.appendChild(item.element));
  penpot.selection = [board];

  console.log(`[Import] Complete: ${created.length} elements created`);
}
