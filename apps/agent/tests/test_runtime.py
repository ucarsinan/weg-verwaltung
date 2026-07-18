"""Tests for the graph→tool runtime seam (app.tools.runtime).

Regression focus: ``RunnableConfig`` is a TypedDict, so LangGraph hands graph
nodes a plain dict. The old attribute-style extraction
(``getattr(config, "configurable", {})``) silently returned ``{}`` there,
which made ``persist_node`` skip its upsert. ``read_configurable``/``get_jwt``
must therefore accept both the dict shape and attribute-style test doubles.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.tools.runtime import (
    GraphToolRuntime,
    get_jwt,
    get_supabase_from_config,
    read_configurable,
    tool_runtime_from_config,
)


class TestReadConfigurable:
    def test_dict_config_the_shape_langgraph_passes(self) -> None:
        config = {"configurable": {"jwt": "token-1", "thread_id": "t-1"}}
        assert read_configurable(config) == {"jwt": "token-1", "thread_id": "t-1"}

    def test_attribute_style_test_double(self) -> None:
        config = SimpleNamespace(configurable={"jwt": "token-2"})
        assert read_configurable(config) == {"jwt": "token-2"}

    def test_none_and_malformed_configs_degrade_to_empty(self) -> None:
        assert read_configurable(None) == {}
        assert read_configurable({}) == {}
        assert read_configurable({"configurable": "broken"}) == {}
        assert read_configurable(SimpleNamespace()) == {}


class TestGetJwt:
    def test_reads_jwt_from_dict_config(self) -> None:
        assert get_jwt({"configurable": {"jwt": "token-3"}}) == "token-3"

    def test_missing_or_empty_jwt_is_none(self) -> None:
        assert get_jwt({"configurable": {}}) is None
        assert get_jwt({"configurable": {"jwt": ""}}) is None
        assert get_jwt(None) is None


class TestToolRuntimeFromConfig:
    def test_builds_the_shape_get_supabase_expects(self) -> None:
        runtime = tool_runtime_from_config({"configurable": {"jwt": "token-4"}})
        assert isinstance(runtime, GraphToolRuntime)
        assert runtime.config["configurable"]["jwt"] == "token-4"

    def test_get_supabase_from_config_requires_jwt(self) -> None:
        with pytest.raises(RuntimeError, match="missing the user JWT"):
            get_supabase_from_config({"configurable": {}})
