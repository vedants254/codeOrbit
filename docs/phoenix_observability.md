# Phoenix Observability Setup

This guide explains how to set up Arize Phoenix for LLM observability and tracing in GitVizz. Phoenix provides comprehensive monitoring, debugging, and evaluation capabilities for your LLM-powered features.

## Overview

GitVizz supports both local (self-hosted) and cloud-based Phoenix deployments:

- **Local Phoenix**: Self-hosted using Docker, ideal for development and on-premise deployments
- **Phoenix Cloud**: Managed service with advanced features and collaboration tools

## Local Phoenix Setup (Docker)

### Prerequisites

- Docker and Docker Compose installed
- GitVizz project setup

### Quick Start

The default `docker-compose.yaml` includes a Phoenix service. Simply run:

```bash
# Start all services including Phoenix
docker-compose up --build
```

**Access Points:**
- Phoenix UI: [http://localhost:6006](http://localhost:6006)
- Backend API: [http://localhost:8003](http://localhost:8003)
- Frontend: [http://localhost:3000](http://localhost:3000)

### Configuration

The local Phoenix setup is pre-configured with:

```yaml
phoenix:
  image: arizephoenix/phoenix:latest
  ports:
    - "6006:6006"  # Phoenix UI and OTLP HTTP collector
    - "4317:4317"  # OTLP gRPC collector
  environment:
    - PHOENIX_WORKING_DIR=/mnt/data
  volumes:
    - phoenix_data:/mnt/data
```

The backend automatically connects to the local Phoenix instance using:
```bash
PHOENIX_COLLECTOR_ENDPOINT=http://phoenix:6006/v1/traces
```

### Data Persistence

Phoenix data is stored in a Docker volume (`phoenix_data`) ensuring traces persist across container restarts.

## Phoenix Cloud Setup

### Prerequisites

1. Create an account at [Phoenix Cloud](https://app.phoenix.arize.com)
2. Generate an API key from your Phoenix dashboard

### Configuration

Update your `.env` file:

```bash
# For Phoenix Cloud deployment
PHOENIX_API_KEY=your-phoenix-api-key-here
PHOENIX_COLLECTOR_ENDPOINT=https://app.phoenix.arize.com/v1/traces
PHOENIX_PROJECT_NAME=gitvizz-backend
```

Then restart your services:

```bash
docker-compose down
docker-compose up --build
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PHOENIX_COLLECTOR_ENDPOINT` | Yes | `http://phoenix:6006/v1/traces` | Phoenix collector endpoint |
| `PHOENIX_API_KEY` | Cloud only | - | API key for Phoenix Cloud |
| `PHOENIX_PROJECT_NAME` | No | `gitvizz-backend` | Project name in Phoenix |

## Features Monitored

Phoenix tracks the following GitVizz features:

- **LLM Calls**: All AI model interactions (OpenAI, Anthropic, etc.)
- **Documentation Generation**: AI-powered code documentation
- **Chat Conversations**: Repository Q&A sessions
- **Code Analysis**: AI-driven code understanding and summarization

## Viewing Traces

### Local Phoenix

1. Open [http://localhost:6006](http://localhost:6006)
2. Navigate to your project traces
3. Filter by timeframe, model, or operation type

### Phoenix Cloud

1. Visit [app.phoenix.arize.com](https://app.phoenix.arize.com)
2. Select your project
3. Explore traces with advanced filtering and analytics

## Troubleshooting

### Phoenix Not Starting

```bash
# Check Phoenix container logs
docker-compose logs phoenix

# Restart Phoenix service
docker-compose restart phoenix
```

### No Traces Appearing

1. Verify `PHOENIX_COLLECTOR_ENDPOINT` is correctly set
2. Check backend logs for Phoenix initialization:
   ```bash
   docker-compose logs backend | grep -i phoenix
   ```

3. Ensure the backend can reach Phoenix:
   ```bash
   # From backend container
   docker-compose exec backend curl http://phoenix:6006/health
   ```

### Cloud Connection Issues

1. Verify your API key is correct
2. Check network connectivity to Phoenix Cloud
3. Review backend logs for authentication errors

## Development Tips

### Testing Phoenix Integration

Use the GitVizz chat feature or documentation generation to trigger LLM calls and see traces in Phoenix.

### Custom Instrumentation

The codebase uses Phoenix's auto-instrumentation. For custom tracking, see the `backend/utils/observability.py` file.

### Performance Monitoring

Phoenix provides insights into:
- LLM latency and costs
- Error rates and patterns
- Token usage across models
- User interaction patterns

## Security Considerations

### Local Deployment
- Phoenix UI is exposed on localhost by default
- Consider firewall rules for production deployments
- Data remains within your infrastructure

### Cloud Deployment
- API keys should be stored securely
- Use environment variables, never commit keys to version control
- Enable appropriate access controls in Phoenix Cloud

## Additional Resources

- [Phoenix Documentation](https://arize.com/docs/phoenix)
- [OpenInference Tracing](https://github.com/Arize-ai/openinference)
- [Phoenix Docker Hub](https://hub.docker.com/r/arizephoenix/phoenix)
