#!/usr/bin/env node
/**
 * ENRICH PRODUCT DATA SCRIPT
 * 
 * Cải thiện dữ liệu sản phẩm hiện có:
 * - Thêm mô tả chi tiết từ AI
 * - Thêm specs chuyên sâu
 * - Tối ưu ảnh (chất lượng cao hơn, nhiều hơn)
 * 
 * Usage:
 *   node scripts/enrichProductData.js
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================== CONSTANTS =====================

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads", "products");
const MAX_IMAGES_PER_PRODUCT = 8; // Tăng từ 4 lên 8 ảnh/product
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

// ===================== LOGGER =====================

const logger = {
  log: (prefix, msg) => console.log(`[${prefix}] ${msg}`),
  error: (prefix, msg) => console.error(`[${prefix}] ❌ ${msg}`),
  success: (prefix, msg) => console.log(`[${prefix}] ✅ ${msg}`),
  info: (prefix, msg) => console.log(`[${prefix}] ℹ️  ${msg}`),
};

// ===================== INITIALIZE =====================

const prisma = new PrismaClient();

// ===================== UTILITIES =====================

function generateRandomFilename(ext) {
  const random = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}_${random}${ext}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryAsync(fn, maxRetries = MAX_RETRIES, label = "") {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, i) * 1000;
      logger.log("RETRY", `${label} - Retry ${i + 1}/${maxRetries} sau ${delay}ms`);
      await sleep(delay);
    }
  }
}

// ===================== AI ENRICHMENT =====================

/**
 * Tạo mô tả chi tiết từ AI
 */
async function enrichProductDescription(productName, category, currentDescription = "") {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const prompt = `
Tạo mô tả chi tiết chuyên sâu cho sản phẩm: "${productName}" trong category: "${category}"

Yêu cầu:
1. Mô tả đầy đủ 300-500 từ về sản phẩm
2. Bao gồm:
   - Giới thiệu về sản phẩm
   - Tính năng chính
   - Lợi ích sử dụng
   - Đối tượng phù hợp
   - Khả năng tương thích
   - Lưu ý khi sử dụng
3. Viết bằng tiếng Việt, chuyên nghiệp, dễ hiểu
4. Chỉ trả về mô tả, không có text khác

${currentDescription ? `Mô tả hiện tại để tham khảo: ${currentDescription}` : ""}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await response.json();
      const description = data.choices?.[0]?.message?.content?.trim() || "";
      return description;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("ENRICH_DESC", `Failed: ${error.message}`);
    return "";
  }
}

/**
 * Tạo specs chi tiết từ AI
 */
async function enrichProductSpecs(productName, category, currentSpecs = {}) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const prompt = `
Tạo thông số kỹ thuật chi tiết cho sản phẩm: "${productName}" trong category: "${category}"

Trả về JSON object với các thông số phù hợp cho category này.
Các field cần bao gồm:
- Tên/Model
- Thương hiệu
- Xuất xứ
- Kích thước
- Cân nặng
- Màu sắc
- Vật liệu
- Công suất (nếu có)
- Bảo hành
- Tính năng chính
- Tương thích (nếu có)

Output chỉ là JSON object valid, không có text khác.

Ví dụ format:
{
  "model": "...",
  "brand": "...",
  "origin": "...",
  "size": "...",
  "weight": "...",
  "color": "...",
  "material": "...",
  "warranty": "24 tháng",
  "features": ["...", "..."],
  "compatibility": ["..."]
}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 800,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await response.json();
      let specsText = data.choices?.[0]?.message?.content?.trim() || "{}";

      // Clean JSON
      specsText = specsText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const specs = JSON.parse(specsText);
      return specs;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("ENRICH_SPECS", `Failed: ${error.message}`);
    return {};
  }
}

// ===================== IMAGE ENHANCEMENT =====================

/**
 * Tìm ảnh chất lượng cao từ Pexels
 */
async function fetchHighQualityImages(query, maxImages = 8) {
  const images = [];

  try {
    if (!process.env.PEXELS_API_KEY) {
      logger.error("PEXELS", "PEXELS_API_KEY not configured");
      return images;
    }

    logger.log("PEXELS", `Searching high-quality images for: "${query}"`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const url = new URL("https://api.pexels.com/v1/search");
      url.searchParams.set("query", query);
      url.searchParams.set("per_page", String(Math.min(maxImages + 5, 80)));
      url.searchParams.set("orientation", "landscape");
      url.searchParams.set("size", "medium"); // Lấy ảnh size medium (chất lượng tốt)

      const pexelsResponse = await fetch(url, {
        headers: {
          Authorization: process.env.PEXELS_API_KEY,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!pexelsResponse.ok) {
        const errorText = await pexelsResponse.text();
        throw new Error(
          `Pexels API error ${pexelsResponse.status}: ${errorText.slice(0, 300)}`
        );
      }

      const data = await pexelsResponse.json();
      const photos = data.photos || [];

      logger.success("PEXELS", `Found ${photos.length} images for "${query}"`);

      // Lọc ảnh chất lượng cao (width > 1200)
      const qualityPhotos = photos
        .filter((p) => p.src.large && p.width > 1200 && p.height > 800)
        .slice(0, maxImages);

      return qualityPhotos.map((photo) => ({
        url: photo.src.large2x || photo.src.large, // Lấy ảnh 2x resolution
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        width: photo.width,
        height: photo.height,
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("PEXELS", `Search failed: ${error.message}`);
    return images;
  }
}

/**
 * Download image từ URL
 */
async function downloadImage(imageUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(imageUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Download error ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = ".jpg";
      const filename = generateRandomFilename(ext);
      const filepath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filepath, buffer);
      logger.success("DOWNLOAD", `Downloaded: ${filename} (${buffer.length} bytes)`);

      return {
        filename,
        filepath,
        relativeUrl: `/uploads/products/${filename}`,
        size: buffer.length,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    logger.error("DOWNLOAD", `Failed to download: ${error.message}`);
    return null;
  }
}

/**
 * Thêm ảnh cho sản phẩm hiện có
 */
async function addImagesToProduct(product) {
  try {
    const existingImages = await prisma.productImage.findMany({
      where: { productId: product.id },
    });

    // Nếu đã có đủ ảnh, bỏ qua
    if (existingImages.length >= MAX_IMAGES_PER_PRODUCT) {
      logger.info("IMAGE", `Product #${product.id} already has ${existingImages.length} images`);
      return existingImages.length;
    }

    logger.log("IMAGE", `Adding more images to product #${product.id}: ${product.name}`);

    // Tìm ảnh từ Pexels
    const searchQuery = product.specifications?.searchKeywords || product.name;
    const qualityPhotos = await fetchHighQualityImages(searchQuery, MAX_IMAGES_PER_PRODUCT);

    if (qualityPhotos.length === 0) {
      logger.error("IMAGE", `No quality images found for "${product.name}"`);
      return existingImages.length;
    }

    // Download ảnh mới
    let addedCount = 0;
    let startOrder = existingImages.length;

    for (const photo of qualityPhotos) {
      if (existingImages.length + addedCount >= MAX_IMAGES_PER_PRODUCT) break;

      const imageData = await downloadImage(photo.url);
      if (imageData) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            imageUrl: imageData.relativeUrl,
            isPrimary: false,
            sortOrder: startOrder + addedCount,
            altText: product.name,
          },
        });
        addedCount++;
        await sleep(300); // Rate limiting
      }
    }

    logger.success("IMAGE", `Added ${addedCount} new images to product #${product.id}`);
    return existingImages.length + addedCount;
  } catch (error) {
    logger.error("IMAGE", `Error adding images: ${error.message}`);
    return 0;
  }
}

// ===================== MAIN FLOW =====================

async function main() {
  try {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║          ENRICH PRODUCT DATA - BY AI & PEXELS          ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    // Fetch products để enrich
    logger.log("INIT", "Fetching products to enrich...");
    const products = await prisma.product.findMany({
      include: {
        detail: true,
        images: true,
        category: true,
      },
      orderBy: { id: "desc" },
      take: 50, // Lấy 50 sản phẩm mới nhất
    });

    if (products.length === 0) {
      throw new Error("No products found to enrich");
    }

    logger.success("INIT", `Found ${products.length} products to enrich`);

    let enrichedCount = 0;
    let imageAddedCount = 0;

    for (const product of products) {
      try {
        logger.log("PRODUCT", `\n--- Processing: #${product.id} "${product.name}" ---`);

        // 1. Enrich description
        const enrichedDescription = await enrichProductDescription(
          product.name,
          product.category?.name || "General",
          product.detail?.fullDescription || ""
        );

        // 2. Enrich specs
        const enrichedSpecs = await enrichProductSpecs(
          product.name,
          product.category?.name || "General",
          product.specifications || {}
        );

        // 3. Update database
        if (enrichedDescription) {
          await prisma.productDetail.upsert({
            where: { productId: product.id },
            create: {
              productId: product.id,
              fullDescription: enrichedDescription,
              inTheBox: product.detail?.inTheBox,
              warrantyPolicy: product.detail?.warrantyPolicy,
            },
            update: {
              fullDescription: enrichedDescription,
            },
          });
          logger.success("DESC", `Updated description for #${product.id}`);
        }

        if (Object.keys(enrichedSpecs).length > 0) {
          const mergedSpecs = { ...product.specifications, ...enrichedSpecs };
          await prisma.product.update({
            where: { id: product.id },
            data: {
              specifications: mergedSpecs,
            },
          });
          logger.success("SPECS", `Updated specs for #${product.id}`);
        }

        // 4. Add more images
        const imageCount = await addImagesToProduct(product);
        imageAddedCount += imageCount;

        enrichedCount++;
        await sleep(1500); // Rate limiting
      } catch (error) {
        logger.error("PRODUCT", `Failed to enrich: ${error.message}`);
      }
    }

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║                      SUMMARY                           ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    logger.success("DONE", `Total enriched: ${enrichedCount}`);
    logger.success("DONE", `Total images: ${imageAddedCount}`);
    console.log("╚════════════════════════════════════════════════════════╝\n");
  } catch (error) {
    logger.error("FATAL", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run
main().catch((error) => {
  logger.error("FATAL", `Uncaught error: ${error.message}`);
  process.exit(1);
});
