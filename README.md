# Compound Colliders: Generative Layout Engine

A generative design tool built to simulate and automate spatial arrangements for modular co-living housing. This project utilizes a React frontend for the interactive user interface and a Python (FastAPI) backend to process the layout logic, adjacency matrices, and rule sets.

## Prerequisites
Ensure you have the following installed on your machine:
* **Python 3.8+**
* **Node.js & npm**
* **Git**

## Quick Start Guide

To run this project locally, you will need to start both the backend server and the frontend environment in separate terminal windows.

1. Clone the Repository
```bash
git clone https://github.com/adelaamandari/compound-colliders-generative-layout.git
cd compound-colliders-generative-layout

2. Start the Backend (FastAPI)
Open a terminal in the root directory and set up your Python environment:
# Create and activate a virtual environment
python -m venv .venv

# Windows activation:
.\.venv\Scripts\activate
# Mac/Linux activation:
# source .venv/bin/activate

# Install required packages
pip install fastapi pydantic uvicorn

# Navigate to the backend folder and start the server
cd BACKEND
uvicorn main:app --reload

The backend API will run at http://localhost:8000. Leave this terminal open.

3. Start the Frontend (React)
Open a second, separate terminal window in the root directory to set up the user interface:
# Navigate to the frontend folder
cd frontend

# Install Node dependencies
npm install

# Start the development server
npm start

The frontend application will automatically open in your browser at http://localhost:3000.

Project Structure
/BACKEND: Contains the FastAPI server, API endpoints, and data models (main.py).

/frontend: Contains the React application, UI components, and visualization logic.

/RULE SET: Contains the core Python scripts governing spatial logic, including the adjacency matrix and residential/communal catalogs.
