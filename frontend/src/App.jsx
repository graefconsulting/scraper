import { useState } from 'react'
import './index.css'
import ScraperForm from './components/ScraperForm'
import ResultsDisplay from './components/ResultsDisplay'

function App() {
  const [urlInput, setUrlInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Parse URLs from textarea
    const urls = urlInput
      .split(/[\n,]+/)
      .map(url => url.trim())
      .filter(url => url.length > 0)

    if (urls.length === 0) {
      setError('Bitte mindestens eine URL eingeben.')
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
        body: JSON.stringify({ urls }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
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
        <h1>Idealo Scraper</h1>
        <p>Preise automatisch extrahieren & vergleichen</p>
      </header>

      <ScraperForm
        urlInput={urlInput}
        setUrlInput={setUrlInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        error={error}
      />

      <ResultsDisplay
        results={results}
        isLoading={isLoading}
      />
    </div>
  )
}

export default App
