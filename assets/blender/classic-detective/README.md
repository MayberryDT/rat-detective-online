# Classic Detective

Editable Blender interpretation of the selected concept image, built with the connected Blender MCP server.

- `classic-detective.blend`: character, studio, packed reference image, and preserved original scene.
- `reference.png`: selected concept.
- `preview.png`: rendered model preview.
- `build.py` and `refine.py`: procedural construction and refinement sources. Run them in order in the same Python namespace to reproduce the model. Running the builder creates a new scene; it does not incorporate subsequent hand edits.

The character faces Blender -Y, with Z up. Named meshes are parented to `Classic Detective • ROOT` in `CHARACTER • Editable Parts`. Materials are separate for coat, lapels, fur, skin, eyes, hat, belt, and accessories. Studio and reference objects live in separate collections.

This is a single-image reconstruction with inferred sides and back, not an exact image-to-mesh conversion. It is unrigged and not connected to the game's model loader. Edit the saved blend directly to refine shape and expression. The original rat is preserved in the other scene.
