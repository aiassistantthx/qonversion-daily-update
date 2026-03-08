--
-- PostgreSQL database dump
--

\restrict EFhX91RLtfX0721uIh0M36a26R6rBCCRzyH1bgOtEe6UX4Q2tudGEMixWoi1WFO

-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: qonversion_events; Type: TABLE; Schema: public; Owner: ivorobyev
--

CREATE TABLE public.qonversion_events (
    id integer NOT NULL,
    event_date timestamp without time zone NOT NULL,
    transaction_id character varying(100),
    transaction_date timestamp without time zone,
    event_name character varying(100),
    app_name character varying(200),
    platform character varying(20),
    app_id character varying(100),
    product_id character varying(200),
    subscription_group character varying(100),
    currency character varying(20),
    price numeric(10,2),
    proceeds numeric(10,2),
    price_usd numeric(10,2),
    proceeds_usd numeric(10,2),
    refund boolean DEFAULT false,
    q_user_id character varying(100),
    user_id character varying(200),
    device character varying(100),
    device_id character varying(100),
    locale character varying(50),
    country character varying(50),
    os_version character varying(50),
    install_date timestamp without time zone,
    media_source character varying(100),
    campaign character varying(500),
    ad_set character varying(500),
    ad character varying(500),
    app_version character varying(50),
    sdk_version character varying(50),
    user_properties jsonb,
    event_receive_date timestamp without time zone
);


ALTER TABLE public.qonversion_events OWNER TO ivorobyev;

--
-- Name: qonversion_events_id_seq; Type: SEQUENCE; Schema: public; Owner: ivorobyev
--

CREATE SEQUENCE public.qonversion_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.qonversion_events_id_seq OWNER TO ivorobyev;

--
-- Name: qonversion_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ivorobyev
--

ALTER SEQUENCE public.qonversion_events_id_seq OWNED BY public.qonversion_events.id;


--
-- Name: qonversion_events id; Type: DEFAULT; Schema: public; Owner: ivorobyev
--

ALTER TABLE ONLY public.qonversion_events ALTER COLUMN id SET DEFAULT nextval('public.qonversion_events_id_seq'::regclass);


--
-- Name: qonversion_events qonversion_events_pkey; Type: CONSTRAINT; Schema: public; Owner: ivorobyev
--

ALTER TABLE ONLY public.qonversion_events
    ADD CONSTRAINT qonversion_events_pkey PRIMARY KEY (id);


--
-- Name: qonversion_events qonversion_events_transaction_id_event_name_event_date_key; Type: CONSTRAINT; Schema: public; Owner: ivorobyev
--

ALTER TABLE ONLY public.qonversion_events
    ADD CONSTRAINT qonversion_events_transaction_id_event_name_event_date_key UNIQUE (transaction_id, event_name, event_date);


--
-- Name: idx_qonversion_campaign; Type: INDEX; Schema: public; Owner: ivorobyev
--

CREATE INDEX idx_qonversion_campaign ON public.qonversion_events USING btree (campaign);


--
-- Name: idx_qonversion_event_date; Type: INDEX; Schema: public; Owner: ivorobyev
--

CREATE INDEX idx_qonversion_event_date ON public.qonversion_events USING btree (event_date);


--
-- Name: idx_qonversion_event_name; Type: INDEX; Schema: public; Owner: ivorobyev
--

CREATE INDEX idx_qonversion_event_name ON public.qonversion_events USING btree (event_name);


--
-- Name: idx_qonversion_media_source; Type: INDEX; Schema: public; Owner: ivorobyev
--

CREATE INDEX idx_qonversion_media_source ON public.qonversion_events USING btree (media_source);


--
-- Name: idx_qonversion_user_id; Type: INDEX; Schema: public; Owner: ivorobyev
--

CREATE INDEX idx_qonversion_user_id ON public.qonversion_events USING btree (q_user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict EFhX91RLtfX0721uIh0M36a26R6rBCCRzyH1bgOtEe6UX4Q2tudGEMixWoi1WFO

