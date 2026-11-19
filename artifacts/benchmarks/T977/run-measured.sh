# Source from a reviewed experiment runner after checking its manifest.
run_measured() {
  local stem=$1
  shift
  local receipt="$stem.complete"
  if [[ -f $receipt && -f $stem.json ]] &&
    [[ $(sed -n '1p' "$receipt") == "$measurement_inputs" ]] &&
    [[ $(sed -n '2p' "$receipt") == "$(sha256sum "$stem.json")" ]]; then
    return
  fi

  if "$@" "$stem.json.part" > "$stem.log" 2>&1; then
    mv "$stem.json.part" "$stem.json" || return
    { printf '%s\n' "$measurement_inputs"; sha256sum "$stem.json"; } > "$receipt.part" || return
    mv "$receipt.part" "$receipt"
  else
    return 1
  fi
}
