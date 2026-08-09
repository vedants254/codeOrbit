import os
import logging
from dotenv import load_dotenv


def initialize_observability() -> None:
    """Initialize Arize Phoenix observability if environment is configured.

    Supports both cloud and local Phoenix deployments:
    For Phoenix Cloud:
      - PHOENIX_API_KEY
      - PHOENIX_COLLECTOR_ENDPOINT
    For Local Phoenix (Docker):
      - PHOENIX_COLLECTOR_ENDPOINT (without API key)

    For Phoenix Cloud, we set both OTEL headers and PHOENIX client headers.
    For local deployment, we only need the collector endpoint.
    """
    # Ensure .env is loaded (safe to call multiple times)
    load_dotenv()

    phoenix_api_key = os.getenv("PHOENIX_API_KEY")
    collector_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT")

    logger = logging.getLogger(__name__)

    if not collector_endpoint:
        logger.info(
            "Phoenix observability not configured (missing PHOENIX_COLLECTOR_ENDPOINT)."
        )
        return

    # Check if this is a cloud deployment (has API key) or local deployment
    is_cloud_deployment = phoenix_api_key is not None

    if is_cloud_deployment:
        # Required for Phoenix Cloud – OTLP exporter header must include api_key
        os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = f"api_key={phoenix_api_key}"
        
        # Also set Phoenix client headers for compatibility with certain cloud spaces
        os.environ["PHOENIX_CLIENT_HEADERS"] = f"api_key={phoenix_api_key}"
        logger.info("Configuring Phoenix for cloud deployment")
    else:
        logger.info("Configuring Phoenix for local deployment")

    # Ensure collector endpoint is set
    os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = collector_endpoint

    try:
        # Register Phoenix OpenInference and auto-instrument installed libs (e.g., LiteLLM)
        from phoenix.otel import register

        register(
            project_name=os.getenv("PHOENIX_PROJECT_NAME", "gitvizz-backend"),
            auto_instrument=True,
        )
        deployment_type = "cloud" if is_cloud_deployment else "local"
        logger.info(f"Phoenix observability initialized and auto-instrumented for {deployment_type} deployment.")
    except Exception as exc:  # Pragmatic catch to avoid blocking app start
        logger.warning(f"Phoenix initialization failed: {exc}") 