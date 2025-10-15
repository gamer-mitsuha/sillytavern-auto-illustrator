# Archive - Historical Planning Documents

This directory contains completed planning and design documents that are kept for historical reference.

## Contents

### design-prompt-regeneration-20251009.md
**Status**: ✅ Completed in v1.1.0 (2025-10-09)

Design document for the prompt regeneration feature (#14). This feature allows users to update image generation prompts using LLM feedback and maintains complete prompt history per position.

**Implemented Features**:
- AI-powered prompt updates via LLM feedback
- Prompt metadata tracking system
- Image-to-prompt associations
- Regeneration with updated prompts

### phase3_implementation_guide.md
**Status**: ✅ Completed in v1.2.0 (2025-10-11)

Implementation guide for Phase 3 of the queue management refactoring. This phase refactored streaming coordination to replace scattered module-level state variables with SessionManager and Barrier-based coordination.

**Implemented Changes**:
- SessionManager replaces 6+ scattered state variables
- Barrier pattern replaces manual flag-based coordination
- Simplified event handlers (handleFirstStreamToken, handleMessageReceivedForStreaming, handleGenerationEnded)
- Removed ~60 lines of complex state management code

### queue_refactoring_proposal.md
**Status**: ✅ Completed in v1.2.0 (2025-10-11)

Comprehensive proposal for refactoring queue management using Bottleneck.js integration. This document outlined the three-phase implementation plan that was successfully completed.

**Implemented Phases**:
- Phase 1: Barrier and SessionManager (committed: 1eb277d)
- Phase 2: Bottleneck integration (committed: aad90fd)
- Part A: Manual generation migration (committed: 3d6ecef)
- Phase 3: Streaming coordination refactor (committed: 5660cad)

**Results**:
- Clear separation of responsibilities
- Encapsulated state management
- Prevented DOM race conditions
- Added runtime dependency: Bottleneck.js

### design_doc_for_unifying_generation_modes.md
**Status**: ✅ Completed in v1.3.0 (2025-10-13)

Comprehensive design document for unifying streaming and regeneration into a single generation pipeline. This document outlined the architectural changes that eliminated the Barrier pattern and consolidated all image insertion logic.

**Implemented Features**:
- Unified `insertDeferredImages()` function supporting multiple modes
- SessionManager handling both streaming and click-to-regenerate
- Explicit await conditions replacing Barrier coordination
- Consolidated prompt tracking via prompt_manager.ts
- Comprehensive test coverage for all v2 modules

### PROMPT_MANAGER_REFACTORING_PLAN.md
**Status**: ✅ Completed in v1.3.0 (2025-10-13)

Detailed refactoring plan for consolidating prompt tracking into a centralized prompt_manager module. This replaced the scattered prompt_metadata functions with a unified, tree-based prompt registry.

**Implemented Features**:
- Tree-based PromptRegistry with parent-child relationships
- Image URL to prompt mapping
- Prompt version history tracking
- Complete migration from prompt_metadata.ts to prompt_manager.ts

### PROMPT_METADATA_USAGE.md
**Status**: ⚠️ Deprecated in v1.3.0 (2025-10-13)

Documentation for the legacy prompt_metadata.ts module. This module has been replaced by prompt_manager.ts and all functions have been deprecated.

**Superseded By**: prompt_manager.ts with PromptRegistry

### design_doc.md
**Status**: ⚠️ Obsolete (archived 2025-10-15)

Early design document that has been superseded by multiple more detailed design documents and the comprehensive PRD.

## Note

These documents are preserved for historical context and to understand the evolution of the codebase. They should not be used as current implementation guides - refer to the main [docs/](../) directory and [PRD.md](../PRD.md) for current documentation.
