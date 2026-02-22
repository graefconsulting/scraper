import { useState, useEffect } from 'react'
import './index.css'
import ScraperForm from './components/ScraperForm'
import ResultsDisplay from './components/ResultsDisplay'
import UrlManager from './components/UrlManager'

function App() {
  const [activeTab, setActiveTab] = useState('scraper')
  const [savedUrls, setSavedUrls] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedUrls') || '[]') } catch { return [] }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    localStorage.setItem('savedUrls', JSON.stringify(savedUrls))
  }, [savedUrls])

  const handleSubmit = async (additionalUrlsText = '') => {
    // Parse URLs from textarea
    const extraUrls = additionalUrlsText
      .split(/[\n,]+/)
      .map(url => url.trim())
      .filter(url => url.length > 0)

    const allUrls = [...new Set([...savedUrls.map(u => u.url), ...extraUrls])]

    if (allUrls.length === 0) {
      setError('Bitte mindestens eine URL eingeben oder unter URLs verwalten hinterlegen.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch('http://72.61.80.21:3000/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls: allUrls }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        // Evaluate History (Diffing)
        const historyObj = JSON.parse(localStorage.getItem('scrapeHistory') || '{}')
        const getBaseUrl = (fullUrl) => fullUrl.split('?')[0]

        data.results.forEach(res => {
          if (!res.success || !res.offers) return;
          const key = getBaseUrl(res.url)
          const prev = historyObj[key]

          if (prev) {
            res.offers.forEach(offer => {
              offer.diff = {}
              if (offer.rank === 1 && prev.rank1) {
                if (offer.price !== prev.rank1.price) offer.diff.oldPrice = prev.rank1.price;
              }
              if (offer.isHealthRise && prev.healthRise) {
                if (offer.price !== prev.healthRise.price) offer.diff.oldPrice = prev.healthRise.price;
                if (offer.rank !== prev.healthRise.rank) offer.diff.oldRank = prev.healthRise.rank;
              }
              if (offer.rank === 2 && prev.rank2) {
                if (offer.shop === prev.rank2.shop && offer.price !== prev.rank2.price) {
                  offer.diff.oldPrice = prev.rank2.price;
                }
              }
            })
          }

          // Save to history
          const newHist = { date: Date.now() }
          const r1 = res.offers.find(o => o.rank === 1)
          if (r1) newHist.rank1 = { price: r1.price, shop: r1.shop }

          const hr = res.offers.find(o => o.isHealthRise)
          if (hr) newHist.healthRise = { price: hr.price, rank: hr.rank, shop: hr.shop }

          const r2 = res.offers.find(o => o.rank === 2)
          if (r2) newHist.rank2 = { price: r2.price, shop: r2.shop }

          historyObj[key] = newHist
        })

        localStorage.setItem('scrapeHistory', JSON.stringify(historyObj))
        setResults(data.results)
      } else {
        throw new Error(data.error || 'Unknown scraping error occurred')
      }
    } catch (err) {
      setError(err.message || 'Fehler beim Verbinden mit dem Scraper-Backend.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="hero">
        <img src="/health-rise-logo.png" alt="Health Rise Logo" className="brand-logo" />
        <h1>Idealo Price Tracker</h1>
        <p>Preise automatisch extrahieren & vergleichen</p>
      </header>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'scraper' ? 'active' : ''}`}
          onClick={() => setActiveTab('scraper')}
        >
          Scraping Lauf
        </button>
        <button
          className={`tab-btn ${activeTab === 'urls' ? 'active' : ''}`}
          onClick={() => setActiveTab('urls')}
        >
          URLs Verwalten ({savedUrls.length})
        </button>
      </div>

      {activeTab === 'scraper' && (
        <>
          <ScraperForm
            savedUrlsCount={savedUrls.length}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />
          <ResultsDisplay
            results={results}
            isLoading={isLoading}
          />
        </>
      )}

      {activeTab === 'urls' && (
        <UrlManager savedUrls={savedUrls} setSavedUrls={setSavedUrls} />
      )}
    </div>
  )
}

export default App
