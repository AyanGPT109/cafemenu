# Sip & Sprout Cafe Menu

A complete cafe ordering system with admin portal for managing customer orders.

## Features

### Customer Menu
- **Mojitos** - Citrus Mint, Berry Basil, Green Apple, Tropical Paradise
- **Cold Coffee** - Cloud Cold Coffee, Caramel Cold Coffee, Mocha Cold Coffee, Vanilla Cold Coffee
- **Hot Coffee** - Classic Espresso, Cappuccino, Latte, Americano
- **Veg Salads** - Garden Glow Bowl, Quinoa Power Bowl, Mediterranean Crunch
- **Non-Veg Salads** - Smoked Chicken Caesar, Peri Peri Crunch Salad

### Shopping Cart
- Add to cart functionality
- Quantity adjustment
- Instant checkout (no popups)
- Mobile responsive design

### Admin Portal
- **Order Management** - FCFO (First Come, First Out) system
- **Item Selection** - Checkboxes next to each menu item
- **Bulk Delete** - Remove selected items from orders
- **Order Totals** - Shows sum of all items per order
- **Real-time Sync** - Mobile orders appear automatically
- **Mobile Compatible** - Works on all devices

## Live Demo
- **Main Menu**: https://sip-sprout-cafe-menu.surge.sh
- **Admin Portal**: https://sip-sprout-cafe-menu.surge.sh/admin.html

## Technology Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Storage**: localStorage for order persistence
- **Styling**: Modern CSS with responsive design
- **Deployment**: Surge.sh

## How to Use

### For Customers
1. Browse the menu items
2. Click "Add to Cart" for desired items
3. Review cart and click "Proceed to Checkout"
4. Order is sent to kitchen instantly

### For Staff
1. Access admin portal
2. View orders in FCFO priority (pending first)
3. Select individual items to delete if needed
4. Complete or cancel orders as processed
5. Monitor real-time order updates

## Project Structure
```
├── index.html          # Main customer menu
├── admin.html          # Admin portal for staff
├── styles.css           # Main menu styling
├── admin-styles.css    # Admin portal styling
└── README.md           # Project documentation
```

## Features Implemented
- Mobile responsive design
- Shopping cart with add/remove functionality
- Order persistence using localStorage
- Admin portal with order management
- FCFO sorting (pending orders first)
- Item-level selection and deletion
- Order total calculation
- Real-time order synchronization
- Bulk operations for efficiency
