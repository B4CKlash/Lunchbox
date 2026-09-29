# Run from any directory: source /path/to/LunchBox/scripts/use-hackathon-tools.sh
# The official Node distribution is installed outside the project.
LUNCHBOX_NODE_BIN="$HOME/.local/share/lunchbox-toolchain/node-v24.21.0-darwin-arm64/bin"
if [ -x "$LUNCHBOX_NODE_BIN/node" ]; then
  case ":$PATH:" in
    *":$LUNCHBOX_NODE_BIN:"*) ;;
    *) export PATH="$LUNCHBOX_NODE_BIN:$PATH" ;;
  esac
  printf 'LunchBox tools ready: Node %s, npm %s\n' "$(node --version)" "$(npm --version)"
else
  printf 'LunchBox Node runtime not installed here. Install Node 24.21.0 using .nvmrc or .node-version.\n' >&2
  unset LUNCHBOX_NODE_BIN
  return 1
fi
unset LUNCHBOX_NODE_BIN
