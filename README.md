# Nintex Partner Portal - Northpass Integration

A React-based certification tracking application for Nintex partners that interfaces with the Northpass LMS API. The application displays company-wide certification statistics with complete Nintex branding and partner tier qualification tracking.

## Features

### 👥 Partner Dashboard
- **🎨 Nintex Branding**: Complete design system with corporate colors and styling
- **📊 Real-time NPCU Tracking**: Live calculation excluding expired certifications  
- **🏆 Certification Monitoring**: Status tracking with expiry date management
- **📅 Expiry Management**: Business rule compliance - expired certs don't count towards totals
- **📈 Partner Tier Qualification**: Automatic tier status calculation (Premier/Select/Registered/Certified)
- **🔄 Collapsible Categories**: Product-based certification grouping (Nintex Workflow, Automation Cloud, etc.)

### 🎓 Customer Dashboard
- **👥 Staff Training Overview**: Individual employee training records and progress
- **📚 Certification Tracking**: Course completion and expiry monitoring without NPCU complexity
- **⚠️ Training Alerts**: Expired and expiring certification notifications
- **📊 Training Statistics**: Staff participation rates and completion metrics
- **🔍 Flexible Lookup**: Find companies by exact name or company ID

### 🔒 Universal Features
- **🔒 Secure URL Encoding**: Hide company and tier parameters from end users
- **🔧 Admin Panel**: Bulk URL generation for both partners and customers
- **✨ Professional UI**: Welcome screens with integrated URL generators
- **🌐 Dual Format Support**: Works with both encoded and regular URL parameters

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and development server
- **Axios** - HTTP client for API requests
- **CSS3** - Modern styling with gradients and animations
- **Northpass API** - Learning management system integration

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager
- Northpass LMS account with API access

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd northpass-pp
```

2. Install dependencies:
```bash
npm install
```

3. Configure API credentials in `src/services/northpassApi.js`:
```javascript
const API_KEY = 'your-northpass-api-key-here';
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to `http://localhost:5173`

## Production Deployment

- **Live URL**: `http://20.125.24.28:3000`
- **Server Management**: PM2 process management on Ubuntu 22.04.5 LTS
- **SSH Access**: Configured with key-based authentication

## API Configuration

The application integrates with Northpass API via server-side proxy to resolve CORS:

- **Groups API**: `/v2/groups` - Find company groups by name
- **People API**: `/v2/people` - User search and transcript data  
- **Courses API**: `/v2/courses` - Course information and completions
- **Properties API**: `/v2/properties/courses/{courseId}` - NPCU values

### Authentication & CORS
- **API Key**: `wcU0QRpN9jnPvXEc5KXMiuVWk` (X-Api-Key header)
- **Proxy Route**: `/api/northpass` → `https://api.northpass.com`
- **CORS**: Resolved via `http-proxy-middleware` server-side proxy

## Usage

### URL Parameters

The application supports multiple dashboard types with both regular and encoded URL parameters:

#### Partner Dashboard (Default Route)
**Regular Format (Legacy Support):**
- **Company**: `?group=CompanyName` or `?company=CompanyName` (exact match required)  
- **Tier**: `?tier=Premier|Select|Registered|Certified`

**Example URLs:**
```
http://20.125.24.28:3000/?group=Acme Corporation&tier=Premier
http://20.125.24.28:3000/?company=Nintex Partner Portal Americas&tier=Certified
```

**Encoded Format (Recommended):**
```
http://20.125.24.28:3000/?data=eyJjb21wYW55IjoiQWNtZSBDb3Jwb3JhdGlvbiIsInRpZXIiOiJQcmVtaWVyIn0
```

#### Customer Dashboard (/customer route)
**Regular Format:**
- **Company**: `?company=CompanyName` (exact match required)
- **Company ID**: `?companyId=company-id` (direct ID lookup)

**Example URLs:**
```
http://20.125.24.28:3000/customer?company=Premier Tech
http://20.125.24.28:3000/customer?companyId=pt-001
```

**Encoded Format (Recommended):**
```
http://20.125.24.28:3000/customer?data=eyJjb21wYW55IjoiUHJlbWllciBUZWNoIiwidHlwZSI6ImN1c3RvbWVyIn0
```

#### URL Generation Tools

**Interactive Generator**: Visit the homepage without parameters to access the built-in URL generator.

**Admin Panel**: Access `/admin` for bulk URL generation and CSV export.

**Programmatic Generation**:
```javascript
import { generateEncodedUrl } from './src/utils/urlEncoder.js';

const encodedUrl = generateEncodedUrl('http://20.125.24.28:3000', {
  company: 'Acme Corporation',
  tier: 'Premier'
});
```

#### Benefits of Encoded URLs
- 🔒 Company names hidden from URL bar
- 🛡️ Partner tiers not visible to end users  
- 📱 Shorter, cleaner URLs
- 🔄 Backward compatible with regular format
- 🌐 Safe handling of special characters

### No Parameters
- Shows professional welcome screen with usage instructions
- Provides URL generator for creating encoded links
- No API calls made - no resource consumption without explicit parameters

### Business Logic
- **Partner Tiers**: Premier (20 NPCU), Select (10 NPCU), Registered (5 NPCU), Certified (varies)
- **Expiry Rules**: Expired certifications DO NOT count towards NPCU totals  
- **Product Mapping**: Nintex Workflow = Nintex Automation Cloud (equivalent products)

## Development

### Project Structure

```
src/
├── components/
│   ├── CompanyWidget.jsx    # Main company certification dashboard
│   ├── CompanyWidget.css    # Nintex branded styling
│   ├── UserWidget.jsx       # Individual user certification widget
│   ├── UserWidget.css       # User widget styles
│   └── NintexButton.jsx     # Branded button component
├── services/
│   └── northpassApi.js      # API integration with rate limiting
├── App.jsx                  # Main application with parameter handling
└── App.css                  # Global Nintex design system
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Customization

The widget is designed to be easily customizable:

1. **Styling**: Modify CSS files to match your brand colors and fonts
2. **API Endpoints**: Update `northpassApi.js` to use different endpoints
3. **Data Display**: Customize components to show additional fields
4. **Responsive Design**: Adjust breakpoints in CSS for different screen sizes

## Error Handling

The widget includes comprehensive error handling:

- API request failures with retry mechanisms
- Loading states with spinners
- User-friendly error messages
- Graceful degradation when data is unavailable

## Security Considerations

- API keys should be stored securely (consider using environment variables)
- Implement proper CORS settings for production deployment
- Validate all API responses before displaying data
- Consider implementing rate limiting for API requests

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or issues:
- Check the Northpass API documentation: https://developers.northpass.com/
- Review the troubleshooting section below

## Troubleshooting

### Common Issues

1. **API Authentication Errors**
   - Verify API key is correct
   - Check API key permissions in Northpass admin

2. **CORS Errors**
   - Configure CORS settings in your hosting environment
   - Use a proxy server for development if needed

3. **Data Not Loading**
   - Check browser console for API errors
   - Verify user has appropriate permissions in Northpass
   - Test API endpoints directly with tools like Postman

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
