#!/bin/bash
# usage: sheet.sh out.png f0110 f0230 ...   (2 columns, 960px each)
out=$1; shift
args=(); filt=""; n=0
for f in "$@"; do args+=(-i "out/stills/$f.png"); filt+="[$n]scale=960:-1[s$n];"; n=$((n+1)); done
row=""; rows=0; i=0
while [ $i -lt $n ]; do
  if [ $((i+1)) -lt $n ]; then filt+="[s$i][s$((i+1))]hstack[r$rows];"; else filt+="[s$i]pad=1920:540[r$rows];"; fi
  row+="[r$rows]"; rows=$((rows+1)); i=$((i+2))
done
filt+="${row}vstack=inputs=$rows"
ffmpeg -y -v error "${args[@]}" -filter_complex "$filt" "$out"
