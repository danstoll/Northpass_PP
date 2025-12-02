import React, { useState } from 'react';
import { generateEncodedUrl } from '../utils/urlEncoder';
import './UrlGenerator.css';

const UrlGenerator = () => {
  const [company, setCompany] = useState('');
  const [tier, setTier] = useState('Premier');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const tiers = ['Premier', 'Select', 'Registered', 'Certified'];

  const handleGenerate = () => {
    if (!company.trim()) {
      alert('Please enter a company name');
      return;
    }

    const baseUrl = window.location.origin;
    const encodedUrl = generateEncodedUrl(baseUrl, {
      company: company.trim(),
      tier: tier
    });

    setGeneratedUrl(encodedUrl);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = generatedUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setCompany('');
    setTier('Premier');
    setGeneratedUrl('');
    setCopied(false);
  };

  return (
    <div className="url-generator">
      <div className="generator-header">
        <h3>🔗 Secure URL Generator</h3>
        <p>Generate encoded URLs to hide company and tier parameters from end users.</p>
      </div>

      <div className="generator-form">
        <div className="form-group">
          <label htmlFor="company">Company Name:</label>
          <input
            type="text"
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Enter exact company name (e.g., Acme Corporation)"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="tier">Partner Tier:</label>
          <select
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="form-select"
          >
            {tiers.map(tierOption => (
              <option key={tierOption} value={tierOption}>
                {tierOption}
              </option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button onClick={handleGenerate} className="generate-btn">
            🚀 Generate Secure URL
          </button>
          {generatedUrl && (
            <button onClick={handleClear} className="clear-btn">
              🗑️ Clear
            </button>
          )}
        </div>
      </div>

      {generatedUrl && (
        <div className="generated-result">
          <div className="result-header">
            <h4>✅ Generated Secure URL:</h4>
          </div>
          
          <div className="url-display">
            <div className="url-text">
              {generatedUrl}
            </div>
            <button 
              onClick={handleCopy} 
              className={`copy-btn ${copied ? 'copied' : ''}`}
              title="Copy to clipboard"
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>

          <div className="url-info">
            <p className="info-text">
              <strong>Benefits:</strong>
            </p>
            <ul className="benefits-list">
              <li>🔒 Company name and tier are hidden from the URL</li>
              <li>🛡️ Parameters are encoded and not easily readable</li>
              <li>🔄 Supports both old and new URL formats for compatibility</li>
              <li>📱 Works across all devices and browsers</li>
            </ul>
          </div>

          <div className="comparison">
            <h5>URL Comparison:</h5>
            <div className="url-comparison">
              <div className="old-url">
                <strong>Old Format (visible parameters):</strong>
                <code>{`${window.location.origin}/?company=${encodeURIComponent(company)}&tier=${tier}`}</code>
              </div>
              <div className="new-url">
                <strong>New Format (hidden parameters):</strong>
                <code>{generatedUrl}</code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UrlGenerator;