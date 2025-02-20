import { config } from 'dotenv'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import puppeteer from 'puppeteer'
import * as cheerio from 'cheerio'
import { serve } from '@hono/node-server'

config();

const VIEWPORT_SIZES = {
  desktop: { width: 1920, height: 1080 },
  // tablet: { width: 768, height: 1024 },
  // mobile: { width: 375, height: 667 }
} as const

interface ProjectInfo {
  url: string;
  screenshots: {
    [key: string]: string;
  };
  metadata: {
    title: string;
    description: string | null;
  };
}

interface RequestWithApiKey {
  headers: {
    'x-api-key'?: string;
  };
}

class ProjectScraper {
  private static async initBrowser() {
    return await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
  }

  public static async scrapeProjectData(url: string): Promise<ProjectInfo> {
    const browser = await this.initBrowser()
    try {
      const page = await browser.newPage()
      
      // Collect screenshots for different viewports
      const screenshots: { [key: string]: string } = {}
      
      for (const [size, dimensions] of Object.entries(VIEWPORT_SIZES)) {
        await page.setViewport(dimensions)
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        })

        const screenshot = await page.screenshot({
          type: 'jpeg',
          quality: 80,
          fullPage: false
        })
        
        const screenshotBase64 = Buffer.from(screenshot).toString('base64')
        screenshots[size] = `data:image/jpeg;base64,${screenshotBase64}`
      }

      const content = await page.content()
      const $ = cheerio.load(content)

      const title = $('title').text() || $('h1').first().text() || ''
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || 
                         null

      return {
        url,
        screenshots,
        metadata: {
          title: title.trim(),
          description: description?.trim() || null
        }
      }

    } catch (error) {
      console.error('Error scraping project data:', error)
      throw error
    } finally {
      await browser.close()
    }
  }

  public static validateUrl(url: string): boolean {
    try {
      const urlObject = new URL(url)
      return urlObject.protocol === 'http:' || urlObject.protocol === 'https:'
    } catch {
      return false
    }
  }
}

const app = new Hono()

// Add CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
  maxAge: 86400,
  credentials: true,
}))

// Health check endpoint
app.get('/', (c) => {
  return c.text('Scraper API is running!')
})

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
    const isValidUrl = ProjectScraper.validateUrl(url)
    if (!isValidUrl) {
      return c.json({ error: 'Invalid URL format' }, 400)
    }

    // Scrape the data
    const scrapedData = await ProjectScraper.scrapeProjectData(url)

    return c.json(scrapedData)
  } catch (error) {
    console.error('Handler error:', error)
    return c.json({
      error: 'Failed to scrape project data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Replace the server startup code
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

if (!process.env.API_KEY) {
  console.warn('Warning: API_KEY environment variable is not set')
}

if (process.env.NODE_ENV !== 'test') {
  serve({
    fetch: app.fetch,
    port
  })
  console.log(`Server is running on port ${port}`)
}

export default app
