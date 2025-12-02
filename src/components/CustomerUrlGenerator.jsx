import React, { useState } from 'react';
import { generateCustomerUrl } from '../utils/customerUrlEncoder';
import './CustomerUrlGenerator.css';

const CustomerUrlGenerator = () => {
  const [company, setCompany] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [lookupMethod, setLookupMethod] = useState('name'); // 'name' or 'id'
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    if (lookupMethod === 'name' && !company.trim()) {
      alert('Please enter a company name');
      return;
    }
    
    if (lookupMethod === 'id' && !companyId.trim()) {
      alert('Please enter a company ID');
      return;
    }

    const baseUrl = window.location.origin;
    const params = {};
    
    if (lookupMethod === 'name') {
      params.company = company.trim();
    } else {
      params.companyId = companyId.trim();
    }

    const encodedUrl = generateCustomerUrl(baseUrl, params);
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
    setCompanyId('');
    setGeneratedUrl('');
    setCopied(false);
  };

  const handleSampleData = () => {
    if (lookupMethod === 'name') {
      setCompany('Premier Tech');
    } else {
      setCompanyId('pt-001');
    }
  };

  return (
    <div className="customer-url-generator">
      <div className="generator-header">
        <h3>🔗 Customer URL Generator</h3>
        <p>Generate secure URLs for customer training dashboards.</p>
      </div>

      <div className="generator-form">
        <div className="form-group">
          <label>Lookup Method:</label>
          <div className="lookup-method-selector">
            <label className="radio-option">
              <input
                type="radio"
                value="name"
                checked={lookupMethod === 'name'}
                onChange={(e) => setLookupMethod(e.target.value)}
              />
              <span>Company Name</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                value="id"
                checked={lookupMethod === 'id'}
                onChange={(e) => setLookupMethod(e.target.value)}
              />
              <span>Company ID</span>
            </label>
          </div>
        </div>

        {lookupMethod === 'name' ? (
          <div className="form-group">
            <label htmlFor="company">Company Name:</label>
            <input
              type="text"
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enter exact company name (e.g., Premier Tech)"
              className="form-input"
            />
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="companyId">Company ID:</label>
            <input
              type="text"
              id="companyId"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="Enter company ID (e.g., pt-001)"
              className="form-input"
            />
          </div>
        )}

        <div className="form-actions">
          <button onClick={handleSampleData} className="sample-btn">
            📝 Use Sample Data
          </button>
          <button onClick={handleGenerate} className="generate-btn">
            🚀 Generate Customer URL
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
            <h4>✅ Generated Customer URL:</h4>
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
              <strong>Customer Dashboard Features:</strong>
            </p>
            <ul className="benefits-list">
              <li>📊 Staff training overview and statistics</li>
              <li>🎓 Individual certification tracking</li>
              <li>📅 Expiry date monitoring and alerts</li>
              <li>👥 Detailed staff member records</li>
              <li>🔒 Secure, encoded company information</li>
            </ul>
          </div>

          <div className="comparison">
            <h5>URL Comparison:</h5>
            <div className="url-comparison">
              <div className="old-url">
                <strong>Regular Format (visible parameters):</strong>
                <code>
                  {`${window.location.origin}/customer?${lookupMethod === 'name' 
                    ? `company=${encodeURIComponent(company)}` 
                    : `companyId=${encodeURIComponent(companyId)}`}`}
                </code>
              </div>
              <div className="new-url">
                <strong>Encoded Format (hidden parameters):</strong>
                <code>{generatedUrl}</code>
              </div>
            </div>
          </div>

          <div className="test-section">
            <button 
              onClick={() => window.open(generatedUrl, '_blank')}
              className="test-btn"
            >
              🔗 Test URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerUrlGenerator;