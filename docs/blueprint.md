# **App Name**: Project Insights

## Core Features:

- Tool Integration: User authentication and project management tool integration (Jira, Trello). OAuth will be used to manage authorization, similar to how many tools request permission for Google accounts. The backend services will handle the OAuth flow, storing refresh tokens securely.
- Velocity Graphs: Display velocity graphs based on ticket status and time tracking data. Ability to display historical data.
- Interactive Dashboards: Interactive dashboards showing overall project status and key metrics.
- Sentiment Analysis: Sentiment analysis tool of comments and descriptions in project tickets to identify potential roadblocks. The LLM will act as a tool, and will use reasoning to decide which pieces of information to incorporate into its output.
- Export: Ability to export data from analytics into other applications.

## Style Guidelines:

- Primary color: Soft blue (#64B5F6) to convey trust and analytical thinking.
- Background color: Light gray (#F0F4F7) for a clean and professional look.
- Accent color: Subtle teal (#4DB6AC) for interactive elements and highlights.
- Clean and modern typography to ensure readability of data.
- Use clear and consistent icons to represent project management tools and data metrics.
- Intuitive layout for dashboards and graphs, ensuring ease of navigation.