"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const puppeteer_1 = __importDefault(require("puppeteer"));
const cheerio = __importStar(require("cheerio"));
const node_server_1 = require("@hono/node-server");
(0, dotenv_1.config)();
const VIEWPORT_SIZES = {
    desktop: { width: 1920, height: 1080 },
    // tablet: { width: 768, height: 1024 },
    // mobile: { width: 375, height: 667 }
};
class ProjectScraper {
    static async initBrowser() {
        return await puppeteer_1.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    static async scrapeProjectData(url) {
        const browser = await this.initBrowser();
        try {
            const page = await browser.newPage();
            // Collect screenshots for different viewports
            const screenshots = {};
            for (const [size, dimensions] of Object.entries(VIEWPORT_SIZES)) {
                await page.setViewport(dimensions);
                await page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 30000,
                });
                const screenshot = await page.screenshot({
                    type: 'jpeg',
                    quality: 80,
                    fullPage: false
                });
                const screenshotBase64 = Buffer.from(screenshot).toString('base64');
                screenshots[size] = `data:image/jpeg;base64,${screenshotBase64}`;
            }
            const content = await page.content();
            const $ = cheerio.load(content);
            const title = $('title').text() || $('h1').first().text() || '';
            const description = $('meta[name="description"]').attr('content') ||
                $('meta[property="og:description"]').attr('content') ||
                null;
            return {
                url,
                screenshots,
                metadata: {
                    title: title.trim(),
                    description: description?.trim() || null
                }
            };
        }
        catch (error) {
            console.error('Error scraping project data:', error);
            throw error;
        }
        finally {
            await browser.close();
        }
    }
    static validateUrl(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.protocol === 'http:' || urlObject.protocol === 'https:';
        }
        catch {
            return false;
        }
    }
}
const app = new hono_1.Hono();
// Add CORS middleware
app.use('/*', (0, cors_1.cors)({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 86400,
    credentials: true,
}));
// Health check endpoint
app.get('/', (c) => {
    return c.text('Scraper API is running!');
});
// Scraping endpoint
app.post('/scrape', async (c) => {
    try {
        // Check for API key
        const apiKey = c.req.header('x-api-key');
        const expectedApiKey = process.env.API_KEY;
        if (!expectedApiKey) {
            console.error('API_KEY environment variable is not set');
            return c.json({ error: 'Server configuration error' }, 500);
        }
        if (!apiKey || apiKey !== expectedApiKey) {
            return c.json({ error: 'Unauthorized - Invalid API key' }, 401);
        }
        const { url } = await c.req.json();
        if (!url) {
            return c.json({ error: 'URL is required' }, 400);
        }
        // Validate URL format
        const isValidUrl = ProjectScraper.validateUrl(url);
        if (!isValidUrl) {
            return c.json({ error: 'Invalid URL format' }, 400);
        }
        // Scrape the data
        const scrapedData = await ProjectScraper.scrapeProjectData(url);
        return c.json(scrapedData);
    }
    catch (error) {
        console.error('Handler error:', error);
        return c.json({
            error: 'Failed to scrape project data',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});
// Replace the server startup code
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
if (!process.env.API_KEY) {
    console.warn('Warning: API_KEY environment variable is not set');
}
if (process.env.NODE_ENV !== 'test') {
    (0, node_server_1.serve)({
        fetch: app.fetch,
        port
    });
    console.log(`Server is running on port ${port}`);
}
exports.default = app;
