# Use official Python image as base
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Create working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies globally (no venv) with increased timeout
ENV UV_HTTP_TIMEOUT=300
RUN uv pip install --system -r pyproject.toml

# Copy application code
COPY . .

# Expose the application port
EXPOSE 8003

# Set default command to run the application
CMD ["python", "server.py"]