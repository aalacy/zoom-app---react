import React from 'react'
import Timer from 'react-timer-wrapper';
import Timecode from 'react-timecode';

const Clock = () => {
    return (
        <Timer active duration={null}>
            <Timecode />
        </Timer>
    );
}

export default Clock;