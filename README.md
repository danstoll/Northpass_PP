# Northpass LMS Integration Widget

A React-based widget that interfaces with the Northpass LMS API to display user information and company certification statistics. This widget is designed to be embedded into a PRM (Partner Relationship Management) system via HTML control.

## Features

- **User Profile Widget**: Displays logged-in user information including:
  - User avatar, name, email, and job title
  - Personal certification summary (completed, in progress, total)
  - Recent certification activity
  - Link to view company-wide statistics

- **Company Statistics Dashboard**: Shows comprehensive company certification data including:
  - Team member count and total certifications
  - Overall completion rate and average scores
  - Status breakdown with visual progress bars
  - Course-specific completion statistics
  - Team member overview with avatars

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

## API Configuration

The widget integrates with the Northpass API using the following endpoints:

- `/v2/people/me` - Get current user information
- `/v2/people/{userId}/certificates` - Get user certifications
- `/v2/groups/{groupId}/certificates` - Get group certifications
- `/v2/groups/{groupId}/people` - Get group members
- `/v2/courses/{courseId}/completions` - Get course completions

### API Authentication

The widget uses Bearer token authentication. Update the API key in `src/services/northpassApi.js`:

```javascript
const API_KEY = 'wcU0QRpN9jnPvXEc5KXMiuVWk'; // Production API Key
```

## Embedding in PRM

To embed this widget in your PRM system:

1. Build the production version:
```bash
npm run build
```

2. Deploy the built files to your web server

3. Embed using an HTML control in your PRM with the user's email:
```html
<iframe 
  src="https://your-domain.com/northpass-widget?email=user@company.com" 
  width="100%" 
  height="600"
  frameborder="0">
</iframe>
```

### Email Parameter

The widget identifies users by their email address passed as a URL parameter:

- **URL Parameter**: `?email=user@company.com`
- **Testing Email**: `Philipp.Wissenbach@BVKontent.de` (used as default for testing)
- **Fallback**: If no email is provided, the widget defaults to the test email

**Example URLs:**
- Production: `https://your-domain.com/northpass-widget?email=john.doe@company.com`
- Testing: `http://localhost:5173?email=Philipp.Wissenbach@BVKontent.de`

## Development

### Project Structure

```
src/
├── components/
│   ├── UserWidget.jsx      # Main user profile widget
│   ├── UserWidget.css      # User widget styles
│   ├── CompanyStats.jsx    # Company statistics component
│   └── CompanyStats.css    # Company stats styles
├── services/
│   └── northpassApi.js     # API integration and utilities
├── App.jsx                 # Main application component
└── App.css                 # Global application styles
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
