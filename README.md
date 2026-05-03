# FlowGuard - Water Management System

A comprehensive water management system for Marinduque Water District with role-based dashboards.

## Project Structure

```
flowguard/
├── public/                 # Public entry point
│   ├── index.html         # Landing page
│   └── signup.html        # Registration page
├── src/                   # Source files
│   ├── assets/           # Static assets
│   │   ├── images/       # Images and photos
│   │   └── icons/        # SVG icons
│   ├── css/              # Stylesheets
│   │   ├── styles.css    # Landing page styles
│   │   └── dashboard.css # Dashboard styles
│   ├── js/               # JavaScript files
│   │   ├── main.js       # Landing page logic
│   │   └── dashboard.js  # Dashboard logic
│   └── pages/            # Dashboard pages
│       ├── customer/     # Customer dashboard
│       ├── general-manager/  # GM dashboard
│       ├── inventory-officer/ # Inventory dashboard
│       ├── technical-team/    # Technician dashboard
│       └── zone-specialist/   # Specialist dashboard
└── docs/                 # Documentation
    └── process.md        # Development process
```

## Features

- **Role-Based Dashboards**: Separate interfaces for different user roles
- **Customer Portal**: Bill payments, complaints, usage tracking
- **Management Dashboard**: Operations overview, staff management, reports
- **Inventory System**: Stock management, MRF processing
- **Technical Team**: Job orders, material requests, schedules
- **Zone Specialist**: Investigations, field reports, inspections

## Technologies

- HTML5
- CSS3 (Custom properties, Grid, Flexbox)
- Vanilla JavaScript
- Lucide Icons
- UI Avatars API (for profile pictures)

## Getting Started

1. Open `public/index.html` in a web browser
2. Navigate to the appropriate dashboard based on user role
3. All dashboards are fully responsive and functional

## User Roles

- **Customer**: Water service consumers
- **General Manager**: Overall operations management
- **Inventory Officer**: Stock and supply chain management
- **Technical Team**: Field technicians and repair staff
- **Zone Specialist**: Area investigations and inspections

## License

Proprietary - Marinduque Water District
