const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API endpoint to extract recipe data from a given URL. It scrapes basic
 * recipe information (title, ingredients and instructions) using cheerio.
 */
app.get('/api/recipe', async (req, res) => {
  const recipeUrl = req.query.url;
  if (!recipeUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const response = await fetch(recipeUrl);
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch recipe page' });
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    let title = $('title').first().text().trim() || recipeUrl;
    // Try to parse JSON-LD first
    let ingredients = [];
    let steps = [];
    const scripts = $('script[type="application/ld+json"]');
    scripts.each((_, elem) => {
      const jsonText = $(elem).html();
      try {
        const json = JSON.parse(jsonText);
        const data = Array.isArray(json) ? json : [json];
        for (const item of data) {
          if (item['@type'] && String(item['@type']).toLowerCase().includes('recipe')) {
            if (item.name) title = item.name;
            if (item.recipeIngredient) {
              ingredients = Array.isArray(item.recipeIngredient) ? item.recipeIngredient : [item.recipeIngredient];
            }
            if (item.recipeInstructions) {
              if (Array.isArray(item.recipeInstructions)) {
                for (const instr of item.recipeInstructions) {
                  if (typeof instr === 'string') steps.push(instr);
                  else if (instr.text) steps.push(instr.text);
                }
              } else if (typeof item.recipeInstructions === 'string') {
                steps = item.recipeInstructions.split(/[\.\n]+/).map(s => s.trim()).filter(Boolean);
              }
            }
            break;
          }
        }
      } catch (_) {
        // ignore JSON parse errors
      }
    });
    // Fallback scraping
    if (!ingredients.length) {
      ingredients = $('[itemprop="recipeIngredient"]').map((i, el) => $(el).text().trim()).get();
      if (!ingredients.length) {
        ingredients = $('.ingredient, .ingredients li').map((i, el) => $(el).text().trim()).get();
      }
    }
    if (!steps.length) {
      steps = $('[itemprop="recipeInstructions"] li').map((i, el) => $(el).text().trim()).get();
      if (!steps.length) {
        steps = $('.instruction, .instructions li').map((i, el) => $(el).text().trim()).get();
      }
    }
    if (!ingredients.length || !steps.length) {
      return res.status(500).json({ error: 'Could not parse recipe' });
    }
    res.json({ title, ingredients, steps, url: recipeUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

// Fallback route: serve index.html for any other path (single page app)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});