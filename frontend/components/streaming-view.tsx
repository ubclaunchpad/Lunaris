"use client"

import dynamic from "next/dynamic"
import {Button} from "@/components/ui/button"
import {useState} from "react";
// Prevent "window is not defined" errors
const DcvViewer = dynamic(() => import("@/components/ui/DcvViewer"), {
    ssr: false,
})


// waiting for a link
const SERVER_URL = "https://128.189.189.50:8443/#launchpad"
const BASE_URL = "/public/dcv-ui"

export default function StreamingView() {
    const [isStreaming, setIsStreaming] = useState(false)
    const onStopButtonClick = () => {
        // TODO stop stream
        setIsStreaming(false)
    }
    const onStartButtonClick = () => {
        // TODO fetch server url and start stream
        setIsStreaming(true)
    }
    return isStreaming ? <CurrentlyStreamingView onStopButtonClick={onStopButtonClick}/> :
        <StartStreamingView onStartButtonClick={onStartButtonClick}/>
}

type StartStreamingViewProps = {
    onStartButtonClick: () => void,
}

type StreamingViewProps = {
    onStopButtonClick: () => void,
}

function CurrentlyStreamingView({onStopButtonClick}: StreamingViewProps) {
    return <div>
        <Button type="submit" onClick={onStopButtonClick}>Stop Streaming!</Button>
        <DcvViewer serverUrl={SERVER_URL} baseUrl={BASE_URL}/>
    </div>
}

function StartStreamingView({onStartButtonClick}: StartStreamingViewProps) {
    return <div>
        <Button type="submit" onClick={onStartButtonClick}>Start Streaming!</Button>
    </div>
}

