# Stage 1: Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install compilation tools needed for C extension modules (e.g. cryptography, psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies to a local directory
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Final minimal stage
FROM python:3.11-slim AS final

WORKDIR /app

# Install postgres client libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed libraries from builder stage
COPY --from=builder /root/.local /home/appuser/.local
COPY . .

# Set up paths and environment variables
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

# Create a non-privileged system user for running the server
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Start server using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
