#!/bin/bash

# Set default values
BATCH_SIZE=5
BATCH_DELAY=5000
ITEM_DELAY=1000
SPECIFIC_ITEM=""
ENV_FILE="../../.env"

# Print usage information
function usage {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -i, --item ITEM_ID     Check a specific item ID"
    echo "  -b, --batch-size SIZE  Set batch size (default: 5)"
    echo "  -d, --batch-delay MS   Set delay between batches in ms (default: 5000)"
    echo "  -t, --item-delay MS    Set delay between items in ms (default: 1000)"
    echo "  -e, --env-file PATH    Path to .env file (default: ../../.env)"
    echo "  -h, --help             Show this help message"
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -i|--item) SPECIFIC_ITEM="$2"; shift ;;
        -b|--batch-size) BATCH_SIZE="$2"; shift ;;
        -d|--batch-delay) BATCH_DELAY="$2"; shift ;;
        -t|--item-delay) ITEM_DELAY="$2"; shift ;;
        -e|--env-file) ENV_FILE="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown parameter: $1"; usage; exit 1 ;;
    esac
    shift
done

# Check if env file exists
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment variables from $ENV_FILE"
else
    echo "Warning: Environment file $ENV_FILE not found. Make sure RPC_URL is set manually."
fi

# Update configuration in the script
echo "Updating configuration..."
sed -i '' "s/BATCH_SIZE: [0-9]*/BATCH_SIZE: $BATCH_SIZE/" runItemsCheck.ts
sed -i '' "s/ITEM_DELAY: [0-9]*/ITEM_DELAY: $ITEM_DELAY/" runItemsCheck.ts
sed -i '' "s/BATCH_DELAY: [0-9]*/BATCH_DELAY: $BATCH_DELAY/" runItemsCheck.ts

# Run the script
if [ -z "$SPECIFIC_ITEM" ]; then
    echo "Running check for all items with batch size: $BATCH_SIZE, batch delay: $BATCH_DELAY ms, item delay: $ITEM_DELAY ms"
    DOTENV_CONFIG_PATH=$ENV_FILE npx ts-node -r dotenv/config runItemsCheck.ts
else
    echo "Running check for specific item ID: $SPECIFIC_ITEM"
    DOTENV_CONFIG_PATH=$ENV_FILE npx ts-node -r dotenv/config runItemsCheck.ts "$SPECIFIC_ITEM"
fi 